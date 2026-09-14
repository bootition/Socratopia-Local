import { useState } from 'react'
import type { ArtifactType } from '../../../shared/types/ids'
import type {
  EndClassArtifactsResult,
  EndClassRecord,
  Flashcard
} from '../../../shared/schemas/artifact'
import { FlashcardEditor } from './FlashcardEditor'

export interface EndClassButtonProps {
  conversationId: string | null
  companionId: string | null
  textbookId: string | null
  /** Disable while the assistant is streaming. */
  disabled?: boolean
  /** Called after a successful full end-class run (start a fresh lesson). */
  onEnded?: () => void
}

const ARTIFACT_LABELS: Record<ArtifactType, string> = {
  lesson_summary: '课堂总结',
  flashcards: '闪卡',
  diary: '日记',
  progress: '学习进度',
  handoff_tail: '接力内容'
}

/**
 * End-class control (F04):
 * - learner-triggered only, with a confirmation dialog
 * - one generation run produces all five artifacts
 * - failed sections can be re-run alone without repeating the class
 */
export function EndClassButton({
  conversationId,
  companionId,
  textbookId,
  disabled = false,
  onEnded
}: EndClassButtonProps): React.ReactElement {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<EndClassArtifactsResult | null>(null)
  /**
   * Snapshot of the conversation this end-class run belongs to. The
   * parent clears ClassroomContext after a successful run, but retries
   * must keep targeting the same conversation.
   */
  const [runConversationId, setRunConversationId] = useState<string | null>(null)

  const activeConversationId = runConversationId ?? conversationId
  const canEnd = activeConversationId !== null && companionId !== null && !busy

  async function run(only?: ArtifactType[]): Promise<void> {
    const targetConversationId = runConversationId ?? conversationId
    if (targetConversationId === null || companionId === null) return
    setRunConversationId(targetConversationId)
    setBusy(true)
    setError(null)
    try {
      const response = await window.socratopia.artifacts.endClass({
        conversationId: targetConversationId,
        companionId,
        textbookId,
        ...(only !== undefined ? { only } : {})
      })
      setResult(response)
      setConfirmOpen(false)
      if (only === undefined) onEnded?.()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '课后整理失败，请重试')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        disabled={disabled || !canEnd}
        className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        下课
      </button>

      {confirmOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="确认下课"
          onKeyDown={(event) => {
            if (event.key === 'Escape') setConfirmOpen(false)
          }}
          className="rounded-md border border-[var(--border)] bg-[var(--background)] p-3 text-xs text-[var(--muted-foreground)]"
        >
          <p className="text-[var(--foreground)]">确认结束本节课吗？</p>
          <p className="mt-1">
            将生成课堂总结、闪卡、日记、学习进度和接力内容；生成失败的部分可以单独重试。
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirmOpen(false)}
              className="rounded border border-[var(--border)] px-2 py-1 hover:bg-[var(--muted)]"
            >
              取消
            </button>
            <button
              type="button"
              autoFocus
              onClick={() => void run()}
              disabled={busy}
              className="rounded bg-[var(--primary)] px-2 py-1 font-medium text-[var(--primary-foreground)] disabled:opacity-50"
            >
              {busy ? '整理中…' : '确认下课'}
            </button>
          </div>
        </div>
      )}

      {error !== null && (
        <div
          role="alert"
          className="rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1.5 text-xs text-red-300"
        >
          {error}
        </div>
      )}

      {result !== null && (
        <EndClassResultView
          record={result.record}
          failed={result.failed}
          busy={busy}
          onRedo={(types) => void run(types)}
          onSaveFlashcards={async (cards: Flashcard[]) => {
            const targetConversationId = runConversationId ?? conversationId
            if (targetConversationId === null) return
            const updated = await window.socratopia.artifacts.updateFlashcards({
              conversationId: targetConversationId,
              flashcards: cards
            })
            setResult((prev) =>
              prev === null
                ? prev
                : {
                    record: updated,
                    failed: prev.failed.filter((type) => type !== 'flashcards')
                  }
            )
          }}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------
// Result view
// ---------------------------------------------------------------

export interface EndClassResultViewProps {
  record: EndClassRecord
  failed: ArtifactType[]
  busy?: boolean
  onRedo?: (types: ArtifactType[]) => void
  /** Persist flashcard edits; when omitted the list is read-only. */
  onSaveFlashcards?: (cards: Flashcard[]) => Promise<void>
  /** Conversation title used for export file names. */
  exportTitle?: string
}

export function EndClassResultView({
  record,
  failed,
  busy = false,
  onRedo,
  onSaveFlashcards,
  exportTitle
}: EndClassResultViewProps): React.ReactElement {
  return (
    <section
      aria-label="课后产物"
      className="space-y-3 rounded-md border border-[var(--border)] bg-[var(--background)] p-3 text-xs text-[var(--muted-foreground)]"
    >
      <p className="text-sm text-[var(--foreground)]">{record.farewell}</p>

      {failed.length > 0 && (
        <div
          role="alert"
          className="flex items-center justify-between gap-2 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-amber-300"
        >
          <span>
            未完成：{failed.map((type) => ARTIFACT_LABELS[type]).join('、')}
          </span>
          {onRedo !== undefined && (
            <button
              type="button"
              onClick={() => onRedo(failed)}
              disabled={busy}
              className="rounded border border-amber-400/50 px-2 py-0.5 disabled:opacity-50"
            >
              {busy ? '重试中…' : '只重试未完成项'}
            </button>
          )}
        </div>
      )}

      {record.summary !== null && (
        <div>
          <h4 className="font-medium text-[var(--foreground)]">课堂总结</h4>
          <p className="whitespace-pre-wrap">{record.summary}</p>
        </div>
      )}

      {onSaveFlashcards !== undefined ? (
        <FlashcardEditor
          flashcards={record.flashcards ?? []}
          title={exportTitle ?? '课堂'}
          onSave={onSaveFlashcards}
        />
      ) : (
        record.flashcards !== null &&
        record.flashcards.length > 0 && (
          <div>
            <h4 className="font-medium text-[var(--foreground)]">
              闪卡（{record.flashcards.length}）
            </h4>
            <ul className="list-disc space-y-1 pl-5">
              {record.flashcards.map((card, index) => (
                <li key={`${index}-${card.question}`}>
                  <span className="text-[var(--foreground)]">{card.question}</span>
                  {' — '}
                  {card.answer}
                </li>
              ))}
            </ul>
          </div>
        )
      )}

      {record.progress !== null && (
        <div>
          <h4 className="font-medium text-[var(--foreground)]">学习进度</h4>
          <p className="whitespace-pre-wrap">{record.progress}</p>
        </div>
      )}

      {record.diary !== null && (
        <div>
          <h4 className="font-medium text-[var(--foreground)]">日记</h4>
          <p className="whitespace-pre-wrap">{record.diary}</p>
        </div>
      )}
    </section>
  )
}
