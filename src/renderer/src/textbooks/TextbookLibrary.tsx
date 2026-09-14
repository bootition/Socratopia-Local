import { useEffect, useState } from 'react'
import type { TextbookMetadata } from '../../../shared/schemas/textbook'
import { useClassroom } from '../context/ClassroomContext'

const FORMAT_LABELS: Record<string, string> = {
  markdown: 'Markdown',
  text: '纯文本',
  pdf: 'PDF',
  epub: 'EPUB',
  docx: 'Word'
}

function formatDate(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString('zh-CN')
}

/**
 * Textbook library management (F21): list imported textbooks, switch the
 * active one, and delete ones that are no longer needed. Deleting keeps
 * lesson history intact — only the grounding material goes away.
 */
export interface TextbookLibraryProps {
  /** Bump to reload the list (e.g. after an import in a sibling view). */
  refreshToken?: number
}

export function TextbookLibrary({ refreshToken = 0 }: TextbookLibraryProps = {}): React.ReactElement {
  const { textbookId, setTextbookId, conversationId, setConversationId } = useClassroom()
  const [textbooks, setTextbooks] = useState<TextbookMetadata[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [orphans, setOrphans] = useState<string[]>([])
  const [cleaning, setCleaning] = useState(false)

  function reload(): void {
    setLoading(true)
    Promise.all([
      window.socratopia.textbooks.list(),
      window.socratopia.textbooks.listOrphans()
    ])
      .then(([loaded, broken]) => {
        setTextbooks(loaded)
        setOrphans(broken)
        setError(null)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : '无法读取教材库')
      })
      .finally(() => setLoading(false))
  }

  async function cleanupOrphans(): Promise<void> {
    const confirmed = window.confirm(
      `删除 ${orphans.length} 个无法读取的教材目录？其中的文件将永久删除。`
    )
    if (!confirmed) return
    setCleaning(true)
    try {
      await window.socratopia.textbooks.cleanupOrphans()
      reload()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '清理失败')
    } finally {
      setCleaning(false)
    }
  }

  useEffect(() => {
    reload()
  }, [refreshToken])

  async function remove(textbook: TextbookMetadata): Promise<void> {
    const confirmed = window.confirm(
      `删除教材《${textbook.title}》？课堂历史会保留，但之后的回复不再引用它。`
    )
    if (!confirmed) return

    setBusyId(textbook.id)
    setError(null)
    try {
      await window.socratopia.textbooks.delete(textbook.id)
      setTextbooks((prev) => prev.filter((t) => t.id !== textbook.id))
      if (textbookId === textbook.id) setTextbookId(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '删除教材失败')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section aria-label="教材库" className="mx-auto w-full max-w-2xl space-y-3 p-6 pb-0">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--foreground)]">教材库</h3>
        <button
          type="button"
          onClick={reload}
          className="rounded border border-[var(--border)] px-2 py-0.5 text-xs hover:bg-[var(--muted)]"
        >
          刷新
        </button>
      </div>

      {loading && (
        <p role="status" className="text-sm text-[var(--muted-foreground)]">
          正在读取教材库…
        </p>
      )}

      {error !== null && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}

      {orphans.length > 0 && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300"
        >
          <span>
            发现 {orphans.length} 个无法读取的教材目录（可能是导入中断留下的残留）。
          </span>
          <button
            type="button"
            onClick={() => void cleanupOrphans()}
            disabled={cleaning}
            className="shrink-0 rounded border border-amber-400/50 px-2 py-0.5 hover:bg-amber-500/20 disabled:opacity-50"
          >
            {cleaning ? '清理中…' : '清理'}
          </button>
        </div>
      )}

      {!loading && error === null && textbooks.length === 0 && (
        <div className="text-sm text-[var(--muted-foreground)]">
          <p>还没有教材，用下面的导入功能粘贴或上传一份（Markdown / 文本 / PDF / EPUB / Word）。</p>
          <button
            type="button"
            onClick={() => reload()}
            className="mt-2 rounded-md border border-[var(--border)] px-3 py-1.5 text-xs hover:bg-[var(--muted)]"
          >
            重试读取
          </button>
        </div>
      )}

      <ul className="space-y-2">
        {textbooks.map((textbook) => {
          const selected = textbookId === textbook.id
          return (
            <li
              key={textbook.id}
              className={
                selected
                  ? 'flex items-center justify-between gap-3 rounded-md border border-[var(--primary)] bg-[var(--muted)] p-3'
                  : 'flex items-center justify-between gap-3 rounded-md border border-[var(--border)] bg-[var(--card)] p-3'
              }
            >
              <div>
                <p className="text-sm text-[var(--foreground)]">
                  {textbook.title}
                  {selected ? ' · 使用中' : ''}
                </p>
                <p className="text-xs text-[var(--muted-foreground)]">
                  {FORMAT_LABELS[textbook.format] ?? textbook.format} · 进度 第{' '}
                  {textbook.progress.currentPage} 页 · 更新于{' '}
                  {formatDate(textbook.updatedAt)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    // Switching textbooks mid-lesson must not bleed one
                    // book's context into the next (upstream 1.0.8 fix).
                    if (textbookId !== textbook.id && conversationId !== null) {
                      setConversationId(null)
                    }
                    setTextbookId(textbook.id)
                  }}
                  aria-pressed={selected}
                  className="rounded border border-[var(--border)] px-2 py-1 text-xs hover:bg-[var(--muted)]"
                >
                  {selected ? '已选择' : '选择'}
                </button>
                <button
                  type="button"
                  onClick={() => void remove(textbook)}
                  disabled={busyId === textbook.id}
                  className="rounded border border-red-400/40 px-2 py-1 text-xs text-red-300 hover:bg-red-500/10 disabled:opacity-50"
                >
                  删除
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
