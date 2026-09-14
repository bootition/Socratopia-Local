import type React from 'react'
import type { Textbook } from '../../../shared/schemas/textbook'

export interface TextbookPreviewProps {
  /** Textbook to preview. `null` renders the empty state. */
  textbook: Textbook | null
  /** When provided, renders an "再导入一本" action. */
  onReimport?: () => void
  /** When provided, renders a "去课堂提问" action. */
  onGoToClassroom?: () => void
}

/** Character cap for the inline body preview; full content stays in the store. */
const PREVIEW_CHARACTER_LIMIT = 4000

const FORMAT_LABELS: Record<Textbook['format'], string> = {
  markdown: 'Markdown',
  text: '纯文本',
  pdf: 'PDF',
  epub: 'EPUB',
  docx: 'Word'
}

/**
 * Read-only preview of the selected textbook source.
 *
 * Renders metadata and a truncated plain-text body: source files are shown
 * verbatim so the user can confirm what was imported. Nothing here writes to
 * storage or touches the filesystem.
 */
export function TextbookPreview({
  textbook,
  onReimport,
  onGoToClassroom
}: TextbookPreviewProps): React.ReactElement {
  if (textbook === null) {
    return (
      <section
        aria-label="教材预览"
        className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--card)] p-5"
      >
        <h2 className="text-base font-semibold text-[var(--card-foreground)]">
          还没有选择教材
        </h2>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          导入 Markdown / 文本 / PDF / EPUB / Word，或在下面直接粘贴内容，课堂就能引用原文。
        </p>
      </section>
    )
  }

  const isTruncated = textbook.content.length > PREVIEW_CHARACTER_LIMIT
  const previewContent = isTruncated
    ? textbook.content.slice(0, PREVIEW_CHARACTER_LIMIT)
    : textbook.content

  return (
    <section
      aria-label="教材预览"
      className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5 text-[var(--card-foreground)]"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
            当前教材
          </p>
          <h2 className="mt-1 truncate text-lg font-semibold">{textbook.title}</h2>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--muted-foreground)]">
            <span className="rounded-full border border-[var(--border)] bg-[var(--muted)] px-2 py-0.5 font-medium">
              {FORMAT_LABELS[textbook.format]}
            </span>
            <span>{textbook.content.length.toLocaleString()} 字符</span>
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {onGoToClassroom !== undefined && (
            <button
              type="button"
              onClick={onGoToClassroom}
              className="rounded-md bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-[var(--primary-foreground)] transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
            >
              去课堂提问 →
            </button>
          )}
          {onReimport !== undefined && (
            <button
              type="button"
              onClick={onReimport}
              className="rounded-md border border-[var(--border)] bg-[var(--muted)] px-3 py-1.5 text-sm font-medium text-[var(--foreground)] transition-colors hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
            >
              再导入一本
            </button>
          )}
        </div>
      </div>

      <pre className="mt-4 max-h-80 overflow-auto whitespace-pre-wrap rounded-md border border-[var(--border)] bg-[var(--background)] p-3 font-mono text-sm leading-6 text-[var(--foreground)]">
        {previewContent}
      </pre>

      {isTruncated && (
        <p className="mt-2 text-xs text-[var(--muted-foreground)]">
          仅显示前 {PREVIEW_CHARACTER_LIMIT.toLocaleString()} 个字符，完整内容已保存。
        </p>
      )}
    </section>
  )
}
