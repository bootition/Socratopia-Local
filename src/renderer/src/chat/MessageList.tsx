import { useRef, useState } from 'react'
import { MarkdownRenderer } from './MarkdownRenderer'
import type { MessageSource } from '../../../shared/schemas/message'
import type { Note, NoteColor } from '../../../shared/schemas/note'

export interface ChatMessageItem {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  /** Textbook passages this message was grounded in (F02). */
  sources?: MessageSource[]
}

export type SelectionAction = 'quote' | 'explain' | 'translate' | 'followup'

export interface MessageListProps {
  messages: ChatMessageItem[]
  /** In-flight assistant draft (only shown while `isStreaming`). */
  streamingContent?: string
  isStreaming?: boolean
  emptyHint?: string
  /** Persist an edit to a stored message (F19). */
  onEditMessage?: (messageId: string, content: string) => Promise<void>
  /** Notes/highlights attached to each message (F05). */
  notesByMessage?: Record<string, Note[]>
  /** Create a note next to a message (F05). */
  onCreateNote?: (messageId: string, text: string, color: NoteColor) => Promise<void>
  /** Act on the learner's current text selection (F06). */
  onSelectionAction?: (action: SelectionAction, text: string) => void
}

const NOTE_DOT: Record<NoteColor, string> = {
  yellow: 'bg-amber-400',
  green: 'bg-emerald-400',
  blue: 'bg-sky-400',
  pink: 'bg-pink-400'
}

/**
 * Accessible classroom transcript.
 *
 * Uses `role="log"` + `aria-live="polite"` so streamed assistant text is
 * announced politely. User text is rendered verbatim; assistant content
 * goes through the hardened Markdown renderer. When `onEditMessage` is
 * provided every stored message can be edited in place.
 */
export function MessageList({
  messages,
  streamingContent = '',
  isStreaming = false,
  emptyHint,
  onEditMessage,
  notesByMessage,
  onCreateNote,
  onSelectionAction
}: MessageListProps): React.ReactElement {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [openSources, setOpenSources] = useState<Record<string, boolean>>({})
  const [noteFor, setNoteFor] = useState<string | null>(null)
  const [noteDraft, setNoteDraft] = useState('')
  const [noteColor, setNoteColor] = useState<NoteColor>('yellow')
  const [noteSaving, setNoteSaving] = useState(false)
  const [noteError, setNoteError] = useState<string | null>(null)
  const [selection, setSelection] = useState<{ text: string; top: number } | null>(null)
  const logRef = useRef<HTMLDivElement>(null)

  function handleMouseUp(): void {
    if (onSelectionAction === undefined) return
    const current = window.getSelection()
    const container = logRef.current
    if (container === null || current === null || current.rangeCount === 0) {
      setSelection(null)
      return
    }

    const range = current.getRangeAt(0)
    // jsdom (and some browsers) return an empty Selection.toString();
    // Range.toString() is the reliable fallback.
    const text = (current.toString() || range.toString()).trim()
    if (text.length === 0 || !container.contains(range.commonAncestorContainer)) {
      setSelection(null)
      return
    }

    // jsdom's Range may not implement getBoundingClientRect.
    const rect =
      typeof range.getBoundingClientRect === 'function'
        ? range.getBoundingClientRect()
        : container.getBoundingClientRect()
    const containerRect = container.getBoundingClientRect()
    setSelection({ text, top: rect.top - containerRect.top + container.scrollTop - 40 })
  }

  function runSelectionAction(action: SelectionAction): void {
    if (selection === null || onSelectionAction === undefined) return
    onSelectionAction(action, selection.text)
    setSelection(null)
    window.getSelection()?.removeAllRanges()
  }

  async function saveNote(messageId: string): Promise<void> {
    if (onCreateNote === undefined) return
    setNoteSaving(true)
    setNoteError(null)
    try {
      await onCreateNote(messageId, noteDraft, noteColor)
      setNoteFor(null)
      setNoteDraft('')
    } catch (err: unknown) {
      setNoteError(err instanceof Error ? err.message : '保存笔记失败')
    } finally {
      setNoteSaving(false)
    }
  }

  const notesFor = (message: ChatMessageItem): React.ReactElement | null => {
    const messageNotes = notesByMessage?.[message.id] ?? []
    if (messageNotes.length === 0 && onCreateNote === undefined) return null

    return (
      <div className="mt-1 space-y-1">
        {messageNotes.map((note) => (
          <p
            key={note.id}
            data-note-color={note.color}
            className="flex items-start gap-1.5 text-xs text-[var(--foreground)]"
          >
            <span
              aria-hidden="true"
              className={`mt-1 inline-block h-2 w-2 shrink-0 rounded-full ${NOTE_DOT[note.color]}`}
            />
            <span className="whitespace-pre-wrap">{note.text}</span>
          </p>
        ))}

        {onCreateNote !== undefined && noteFor !== message.id && (
          <button
            type="button"
            onClick={() => {
              setNoteFor(message.id)
              setNoteDraft('')
              setNoteError(null)
            }}
            className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          >
            记笔记
          </button>
        )}

        {noteFor === message.id && (
          <div className="space-y-1">
            <label className="sr-only" htmlFor={`note-input-${message.id}`}>
              笔记内容
            </label>
            <textarea
              id={`note-input-${message.id}`}
              aria-label="笔记内容"
              rows={2}
              value={noteDraft}
              onChange={(event) => setNoteDraft(event.target.value)}
              className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm text-[var(--foreground)]"
            />
            <div className="flex items-center gap-2">
              <label className="text-xs text-[var(--muted-foreground)]" htmlFor={`note-color-${message.id}`}>
                颜色
              </label>
              <select
                id={`note-color-${message.id}`}
                aria-label="笔记颜色"
                value={noteColor}
                onChange={(event) => setNoteColor(event.target.value as NoteColor)}
                className="rounded border border-[var(--border)] bg-[var(--background)] px-1 py-0.5 text-xs text-[var(--foreground)]"
              >
                <option value="yellow">黄色</option>
                <option value="green">绿色</option>
                <option value="blue">蓝色</option>
                <option value="pink">粉色</option>
              </select>
              <button
                type="button"
                onClick={() => void saveNote(message.id)}
                disabled={noteSaving || noteDraft.trim().length === 0}
                className="rounded bg-[var(--primary)] px-2 py-0.5 text-xs font-medium text-[var(--primary-foreground)] disabled:opacity-50"
              >
                {noteSaving ? '保存中…' : '保存笔记'}
              </button>
              <button
                type="button"
                onClick={() => setNoteFor(null)}
                className="rounded border border-[var(--border)] px-2 py-0.5 text-xs hover:bg-[var(--muted)]"
              >
                取消
              </button>
              {noteError !== null && (
                <span role="alert" className="text-xs text-red-400">
                  {noteError}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  function startEdit(message: ChatMessageItem): void {
    // Do not silently discard an in-progress edit of another message.
    if (editingId !== null && editingId !== message.id) return
    setEditingId(message.id)
    setDraft(message.content)
    setEditError(null)
  }

  async function saveEdit(): Promise<void> {
    if (editingId === null || onEditMessage === undefined) return
    setSaving(true)
    setEditError(null)
    try {
      await onEditMessage(editingId, draft)
      setEditingId(null)
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const editorFor = (message: ChatMessageItem): React.ReactElement | null => {
    if (editingId !== message.id) return null
    return (
      <div className="w-full space-y-2">
        <label className="sr-only" htmlFor={`edit-${message.id}`}>
          编辑消息
        </label>
        <textarea
          id={`edit-${message.id}`}
          aria-label="编辑消息"
          rows={4}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void saveEdit()}
            disabled={saving || draft.trim().length === 0}
            className="rounded bg-[var(--primary)] px-2 py-1 text-xs font-medium text-[var(--primary-foreground)] disabled:opacity-50"
          >
            {saving ? '保存中…' : '保存'}
          </button>
          <button
            type="button"
            onClick={() => setEditingId(null)}
            className="rounded border border-[var(--border)] px-2 py-1 text-xs hover:bg-[var(--muted)]"
          >
            取消
          </button>
          {editError !== null && (
            <span role="alert" className="text-xs text-red-400">
              {editError}
            </span>
          )}
        </div>
      </div>
    )
  }

  return (
    <div
      ref={logRef}
      role="log"
      aria-live={isStreaming ? 'off' : 'polite'}
      aria-label="课堂消息"
      onMouseUp={handleMouseUp}
      onKeyDown={(event) => {
        if (event.key === 'Escape') setSelection(null)
      }}
      className="relative flex flex-col gap-4"
    >
      {selection !== null && (
        <div
          role="toolbar"
          aria-label="划词工具"
          onMouseDown={(event) => event.preventDefault()}
          style={{ top: Math.max(0, selection.top) }}
          className="absolute left-2 z-10 flex gap-1 rounded-md border border-[var(--border)] bg-[var(--card)] p-1 shadow-lg"
        >
          <button type="button" onClick={() => runSelectionAction('quote')} className="rounded px-2 py-0.5 text-xs hover:bg-[var(--muted)]">
            引用
          </button>
          <button type="button" onClick={() => runSelectionAction('explain')} className="rounded px-2 py-0.5 text-xs hover:bg-[var(--muted)]">
            解释
          </button>
          <button type="button" onClick={() => runSelectionAction('translate')} className="rounded px-2 py-0.5 text-xs hover:bg-[var(--muted)]">
            翻译
          </button>
          <button type="button" onClick={() => runSelectionAction('followup')} className="rounded px-2 py-0.5 text-xs hover:bg-[var(--muted)]">
            追问
          </button>
        </div>
      )}
      {messages.length === 0 && !isStreaming && emptyHint !== undefined && (
        <p className="text-sm text-[var(--muted-foreground)]">{emptyHint}</p>
      )}

      {messages.map((message) => {
        if (message.role === 'system') {
          return (
            <p
              key={message.id}
              className="text-center text-xs text-[var(--muted-foreground)]"
            >
              {message.content}
            </p>
          )
        }

        const editing = editingId === message.id
        const canEdit = onEditMessage !== undefined && !editing

        if (message.role === 'user') {
          return (
            <div key={message.id} className="flex flex-col items-end gap-1" data-role="user">
              {editing ? (
                editorFor(message)
              ) : (
                <div className="max-w-[85%] whitespace-pre-wrap rounded-lg bg-[var(--muted)] px-3 py-2 text-sm text-[var(--foreground)]">
                  {message.content}
                </div>
              )}
              {canEdit && (
                <button
                  type="button"
                  onClick={() => startEdit(message)}
                  className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                >
                  编辑
                </button>
              )}
              {!editing && notesFor(message)}
            </div>
          )
        }

        return (
          <div key={message.id} data-role="assistant" className="space-y-1">
            {editing ? (
              editorFor(message)
            ) : (
              <MarkdownRenderer content={message.content} mode="static" />
            )}
            {!editing && message.sources !== undefined && message.sources.length > 0 && (
              <div>
                <button
                  type="button"
                  aria-expanded={openSources[message.id] === true}
                  onClick={() =>
                    setOpenSources((prev) => ({
                      ...prev,
                      [message.id]: !prev[message.id]
                    }))
                  }
                  className="text-xs text-[var(--muted-foreground)] underline-offset-2 hover:text-[var(--foreground)] hover:underline"
                >
                  来源（{message.sources.length}）
                </button>
                {openSources[message.id] === true && (
                  <ul className="mt-2 space-y-2 border-l-2 border-[var(--border)] pl-3">
                    {message.sources.map((source) => (
                      <li key={`${message.id}-${source.segmentId}`}>
                        <p className="text-xs text-[var(--muted-foreground)]">
                          {source.label}
                        </p>
                        <p className="whitespace-pre-wrap text-xs text-[var(--foreground)]">
                          {source.text}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {canEdit && (
              <button
                type="button"
                onClick={() => startEdit(message)}
                className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              >
                编辑
              </button>
            )}
            {!editing && notesFor(message)}
          </div>
        )
      })}

      {isStreaming && (
        <div data-role="assistant-draft">
          {streamingContent.length > 0 ? (
            <MarkdownRenderer content={streamingContent} mode="streaming" />
          ) : (
            <p className="text-sm text-[var(--muted-foreground)]">正在思考…</p>
          )}
        </div>
      )}
    </div>
  )
}
