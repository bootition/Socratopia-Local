import { useEffect, useState } from 'react'
import type { Conversation } from '../../../shared/schemas/conversation'
import type { TextbookMetadata } from '../../../shared/schemas/textbook'
import type { UsageSummary } from '../../../shared/schemas/usage'

export interface ProgressPanelProps {
  /** Select a textbook and jump into the classroom. */
  onContinue: (textbook: TextbookMetadata) => void
  /** Restore a finished lesson in the classroom. */
  onOpenConversation: (conversation: Conversation) => void
}

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
 * Progress visualisation (F36): where each textbook stands, how many
 * lessons are finished, and the local token total. No invented metrics:
 * a progress bar is only drawn when the total page count is known.
 */
export function ProgressPanel({
  onContinue,
  onOpenConversation
}: ProgressPanelProps): React.ReactElement {
  const [textbooks, setTextbooks] = useState<TextbookMetadata[]>([])
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [usage, setUsage] = useState<UsageSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      window.socratopia.textbooks.list(),
      window.socratopia.conversations.list(),
      window.socratopia.stats.get()
    ])
      .then(([books, lessons, usageSummary]) => {
        if (cancelled) return
        setTextbooks(books)
        setConversations(lessons)
        setUsage(usageSummary)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '无法读取学习进度')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const finishedLessons = conversations
    .filter((conversation) => conversation.endedAt !== null)
    .sort((a, b) => new Date(b.endedAt ?? 0).getTime() - new Date(a.endedAt ?? 0).getTime())
    .slice(0, 5)

  return (
    <section aria-label="学习进度" className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <div>
        <h2 className="text-lg font-semibold text-[var(--foreground)]">学习进度</h2>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          进度来自每节课下课时提交的记录；随时可以回到任意一本教材继续。
        </p>
      </div>

      {loading && (
        <p role="status" className="text-sm text-[var(--muted-foreground)]">
          正在读取进度…
        </p>
      )}

      {error !== null && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}

      {!loading && error === null && (
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-3">
            <dt className="text-xs text-[var(--muted-foreground)]">教材</dt>
            <dd className="text-lg font-semibold text-[var(--foreground)]">
              {textbooks.length}
            </dd>
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-3">
            <dt className="text-xs text-[var(--muted-foreground)]">已完成课堂</dt>
            <dd className="text-lg font-semibold text-[var(--foreground)]">
              {conversations.filter((c) => c.endedAt !== null).length}
            </dd>
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-3">
            <dt className="text-xs text-[var(--muted-foreground)]">累计 token</dt>
            <dd className="text-lg font-semibold text-[var(--foreground)]">
              {(usage?.totalTokens ?? 0).toLocaleString('zh-CN')}
            </dd>
          </div>
        </dl>
      )}

      {textbooks.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-[var(--foreground)]">教材进度</h3>
          <ul className="space-y-3">
            {textbooks.map((textbook) => {
              const { currentPage, totalPages } = textbook.progress
              // Never display/announce a page beyond the known total.
              const safeCurrent =
                totalPages !== null && totalPages > 0
                  ? Math.min(currentPage, totalPages)
                  : currentPage
              const percent =
                totalPages !== null && totalPages > 0
                  ? Math.round((safeCurrent / totalPages) * 100)
                  : null

              return (
                <li
                  key={textbook.id}
                  className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-[var(--foreground)]">
                        {textbook.title}
                      </p>
                      <p className="text-xs text-[var(--muted-foreground)]">
                        {FORMAT_LABELS[textbook.format] ?? textbook.format} · 更新于{' '}
                        {formatDate(textbook.updatedAt)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onContinue(textbook)}
                      className="shrink-0 rounded-md border border-[var(--border)] px-3 py-1.5 text-xs hover:bg-[var(--muted)]"
                    >
                      继续学习
                    </button>
                  </div>

                  {percent !== null ? (
                    <div className="mt-3">
                      <div
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={totalPages ?? 0}
                        aria-valuenow={safeCurrent}
                        aria-label={`${textbook.title} 进度`}
                        className="h-2 w-full overflow-hidden rounded-full bg-[var(--muted)]"
                      >
                        <div
                          className="h-full rounded-full bg-[var(--primary)]"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                      <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                        第 {safeCurrent} / {totalPages} 页 · {percent}%
                      </p>
                    </div>
                  ) : (
                    <p className="mt-3 text-xs text-[var(--muted-foreground)]">
                      当前位置：第 {safeCurrent} 页（该格式没有总页数，无法计算百分比）
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {finishedLessons.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-[var(--foreground)]">最近完成的课堂</h3>
          <ul className="space-y-2">
            {finishedLessons.map((conversation) => (
              <li
                key={conversation.id}
                className="flex items-center justify-between gap-3 rounded-md border border-[var(--border)] bg-[var(--card)] p-3"
              >
                <div>
                  <p className="text-sm text-[var(--foreground)]">{conversation.title}</p>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    完成于 {formatDate(conversation.endedAt ?? conversation.updatedAt)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenConversation(conversation)}
                  className="rounded border border-[var(--border)] px-2 py-1 text-xs hover:bg-[var(--muted)]"
                >
                  打开
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!loading && textbooks.length === 0 && conversations.length === 0 && (
        <p className="text-sm text-[var(--muted-foreground)]">
          还没有学习记录，先去 Classroom 上第一节课吧。
        </p>
      )}
    </section>
  )
}
