import { useEffect, useState } from 'react'
import type { Note } from '../../../shared/schemas/note'

const COLOR_DOT: Record<Note['color'], string> = {
  yellow: 'bg-amber-400',
  green: 'bg-emerald-400',
  blue: 'bg-sky-400',
  pink: 'bg-pink-400'
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString('zh-CN')
}

/**
 * Notes & highlights overview (F05).
 *
 * Lists every local note with its conversation, quote and colour; notes
 * can be edited or deleted here. Creation happens next to the message
 * in the classroom, so the note keeps its context.
 */
export function NotesPanel(): React.ReactElement {
  const [notes, setNotes] = useState<Note[]>([])
  const [conversationTitles, setConversationTitles] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      window.socratopia.notes.list(),
      window.socratopia.conversations.list()
    ])
      .then(([loadedNotes, conversations]) => {
        if (cancelled) return
        setNotes(loadedNotes)
        setConversationTitles(
          Object.fromEntries(conversations.map((c) => [c.id, c.title]))
        )
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '无法读取笔记')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function saveEdit(noteId: string): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      const updated = await window.socratopia.notes.update({ noteId, text: draft })
      setNotes((prev) => prev.map((n) => (n.id === noteId ? updated : n)))
      setEditingId(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '保存笔记失败')
    } finally {
      setBusy(false)
    }
  }

  async function remove(noteId: string): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      await window.socratopia.notes.delete(noteId)
      setNotes((prev) => prev.filter((n) => n.id !== noteId))
      if (editingId === noteId) setEditingId(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '删除笔记失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-label="课堂笔记" className="mx-auto w-full max-w-3xl space-y-4 p-6">
      <div>
        <h2 className="text-lg font-semibold text-[var(--foreground)]">课堂笔记</h2>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          在课堂消息旁点「记笔记」即可留下自己的想法；这里汇总全部笔记。
        </p>
      </div>

      {loading && (
        <p role="status" className="text-sm text-[var(--muted-foreground)]">
          正在读取笔记…
        </p>
      )}

      {error !== null && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}

      {!loading && error === null && notes.length === 0 && (
        <p className="text-sm text-[var(--muted-foreground)]">
          还没有笔记。上课时在同伴的回复旁记一条试试。
        </p>
      )}

      <ul className="space-y-3">
        {notes.map((note) => (
          <li
            key={note.id}
            className="rounded-md border border-[var(--border)] bg-[var(--card)] p-3"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
                <span
                  aria-hidden="true"
                  className={`inline-block h-2.5 w-2.5 rounded-full ${COLOR_DOT[note.color]}`}
                />
                <span>{conversationTitles[note.conversationId] ?? '未命名课堂'}</span>
                <span>· {formatTimestamp(note.updatedAt)}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (editingId !== null && editingId !== note.id) return
                    setEditingId(note.id)
                    setDraft(note.text)
                  }}
                  className="rounded border border-[var(--border)] px-2 py-0.5 text-xs hover:bg-[var(--muted)]"
                >
                  编辑
                </button>
                <button
                  type="button"
                  onClick={() => void remove(note.id)}
                  disabled={busy}
                  className="rounded border border-red-400/40 px-2 py-0.5 text-xs text-red-300 hover:bg-red-500/10 disabled:opacity-50"
                >
                  删除
                </button>
              </div>
            </div>

            {note.quote.length > 0 && (
              <blockquote className="mt-2 border-l-2 border-[var(--border)] pl-2 text-xs italic text-[var(--muted-foreground)]">
                {note.quote}
              </blockquote>
            )}

            {editingId === note.id ? (
              <div className="mt-2 space-y-2">
                <label className="sr-only" htmlFor={`note-${note.id}`}>
                  笔记内容
                </label>
                <textarea
                  id={`note-${note.id}`}
                  aria-label="笔记内容"
                  rows={3}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm text-[var(--foreground)]"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void saveEdit(note.id)}
                    disabled={busy || draft.trim().length === 0}
                    className="rounded bg-[var(--primary)] px-2 py-1 text-xs font-medium text-[var(--primary-foreground)] disabled:opacity-50"
                  >
                    保存
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="rounded border border-[var(--border)] px-2 py-1 text-xs hover:bg-[var(--muted)]"
                  >
                    取消
                  </button>
                </div>
              </div>
            ) : (
              <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--foreground)]">
                {note.text}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
