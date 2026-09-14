import { useEffect, useState } from 'react'

export interface ReadingWindowProps {
  textbookId: string
  title: string
  /** Page the learner reached last lesson (1-based; 0 means start). */
  initialPage: number
}

interface PageData {
  page: number
  totalPages: number
  text: string
}

/**
 * Paged reading window for PDF textbooks.
 *
 * Page flipping is local to the lesson: it does NOT commit progress.
 * Only the end-class artifact updates `progress.currentPage` (F03), so
 * casual browsing never becomes the starting point of the next lesson.
 */
export function ReadingWindow({
  textbookId,
  title,
  initialPage
}: ReadingWindowProps): React.ReactElement | null {
  const [page, setPage] = useState(Math.max(1, initialPage))
  const [data, setData] = useState<PageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    setPage(Math.max(1, initialPage))
  }, [textbookId, initialPage])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    window.socratopia.textbooks
      .getPage(textbookId, page)
      .then((result) => {
        if (!cancelled) {
          setData(result)
          setError(null)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '无法读取教材页')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [textbookId, page])

  // Not a paged textbook (Markdown/text/EPUB/DOCX): nothing to show.
  if (!loading && error === null && data === null) return null

  if (error !== null) {
    return (
      <div
        role="alert"
        className="border-b border-[var(--border)] bg-[var(--background)] px-4 py-2 text-xs text-red-400"
      >
        阅读窗口读取失败：{error}
      </div>
    )
  }

  const totalPages = data?.totalPages ?? 0

  return (
    <div className="border-b border-[var(--border)] bg-[var(--background)]">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between px-4 py-2 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
      >
        <span>
          阅读窗口：{title} · 第 {loading ? page : (data?.page ?? page)} /{' '}
          {totalPages || '?'} 页
        </span>
        <span>{open ? '收起' : '展开'}</span>
      </button>

      {open && (
        <div className="space-y-2 px-4 pb-3">
          {loading ? (
            <p role="status" className="text-xs text-[var(--muted-foreground)]">
              正在读取第 {page} 页…
            </p>
          ) : (
            <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-md border border-[var(--border)] bg-[var(--card)] p-3 text-xs leading-6 text-[var(--foreground)]">
              {data?.text.trim().length === 0 ? '（本页没有可提取的文字）' : data?.text}
            </pre>
          )}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              disabled={loading || page <= 1}
              className="rounded border border-[var(--border)] px-2 py-0.5 text-xs hover:bg-[var(--muted)] disabled:opacity-50"
            >
              上一页
            </button>
            <button
              type="button"
              onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
              disabled={loading || data === null || page >= totalPages}
              className="rounded border border-[var(--border)] px-2 py-0.5 text-xs hover:bg-[var(--muted)] disabled:opacity-50"
            >
              下一页
            </button>
          </div>
          <p className="text-right text-xs text-[var(--muted-foreground)]">
            翻页不会提交进度；下课时才会记录到「学习进度」。
          </p>
        </div>
      )}
    </div>
  )
}
