import { useEffect, useState } from 'react'
import type { Flashcard } from '../../../shared/schemas/artifact'
import {
  downloadTextFile,
  exportFileName,
  flashcardsToMarkdown,
  flashcardsToTsv
} from './flashcard-export'

export interface FlashcardEditorProps {
  flashcards: Flashcard[]
  /** Conversation title, used for export file names */
  title?: string
  /** Persist edits. When omitted the editor only exports. */
  onSave?: (cards: Flashcard[]) => Promise<void>
}

const inputClass =
  'mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm text-[var(--foreground)] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]'

/**
 * Fully editable flashcard list (F12/F13): edit question, answer and
 * explanation, add or delete cards, save back to the local artifact
 * record, and export as Markdown or Anki-compatible TSV.
 */
export function FlashcardEditor({
  flashcards,
  title = '课堂',
  onSave
}: FlashcardEditorProps): React.ReactElement {
  const [cards, setCards] = useState<Flashcard[]>(flashcards)
  const [status, setStatus] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Keep local edits in sync when the persisted record changes.
  useEffect(() => {
    setCards(flashcards)
  }, [flashcards])

  const canSave =
    onSave !== undefined &&
    cards.length > 0 &&
    cards.every(
      (card) => card.question.trim().length > 0 && card.answer.trim().length > 0
    )

  function updateCard(index: number, patch: Partial<Flashcard>): void {
    setCards((prev) =>
      prev.map((card, i) => (i === index ? { ...card, ...patch } : card))
    )
    setStatus(null)
  }

  function removeCard(index: number): void {
    setCards((prev) => prev.filter((_, i) => i !== index))
    setStatus(null)
  }

  function addCard(): void {
    setCards((prev) => [...prev, { question: '', answer: '', explanation: '' }])
    setStatus(null)
  }

  async function save(): Promise<void> {
    if (onSave === undefined || !canSave) return
    setSaving(true)
    setStatus(null)
    try {
      await onSave(cards)
      setStatus('已保存')
    } catch (err: unknown) {
      setStatus(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-medium text-[var(--foreground)]">
          闪卡（{cards.length}）
        </h4>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => downloadTextFile(exportFileName(title, 'md'), flashcardsToMarkdown(title, cards), 'text/markdown')}
            disabled={cards.length === 0}
            className="rounded border border-[var(--border)] px-2 py-0.5 text-xs hover:bg-[var(--muted)] disabled:opacity-50"
          >
            导出 Markdown
          </button>
          <button
            type="button"
            onClick={() => downloadTextFile(exportFileName(title, 'txt'), flashcardsToTsv(cards))}
            disabled={cards.length === 0}
            className="rounded border border-[var(--border)] px-2 py-0.5 text-xs hover:bg-[var(--muted)] disabled:opacity-50"
          >
            导出 TXT（Anki）
          </button>
        </div>
      </div>

      {cards.length === 0 && (
        <p className="text-xs text-[var(--muted-foreground)]">
          还没有闪卡，可以手动添加，也可以在课堂里重试生成。
        </p>
      )}

      <ul className="space-y-3">
        {cards.map((card, index) => (
          <li
            key={index}
            className="space-y-2 rounded-md border border-[var(--border)] bg-[var(--background)] p-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--muted-foreground)]">
                第 {index + 1} 张
              </span>
              <button
                type="button"
                onClick={() => removeCard(index)}
                className="rounded border border-red-400/40 px-2 py-0.5 text-xs text-red-300 hover:bg-red-500/10"
              >
                删除
              </button>
            </div>
            <label className="block text-xs text-[var(--muted-foreground)]">
              问题
              <textarea
                aria-label={`问题 ${index + 1}`}
                rows={2}
                className={inputClass}
                value={card.question}
                onChange={(event) => updateCard(index, { question: event.target.value })}
              />
            </label>
            <label className="block text-xs text-[var(--muted-foreground)]">
              答案
              <textarea
                aria-label={`答案 ${index + 1}`}
                rows={2}
                className={inputClass}
                value={card.answer}
                onChange={(event) => updateCard(index, { answer: event.target.value })}
              />
            </label>
            <label className="block text-xs text-[var(--muted-foreground)]">
              解析
              <textarea
                aria-label={`解析 ${index + 1}`}
                rows={2}
                className={inputClass}
                value={card.explanation}
                onChange={(event) => updateCard(index, { explanation: event.target.value })}
              />
            </label>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={addCard}
          className="rounded border border-[var(--border)] px-2 py-1 text-xs hover:bg-[var(--muted)]"
        >
          添加闪卡
        </button>
        {onSave !== undefined && (
          <button
            type="button"
            onClick={() => void save()}
            disabled={!canSave || saving}
            className="rounded bg-[var(--primary)] px-2 py-1 text-xs font-medium text-[var(--primary-foreground)] disabled:opacity-50"
          >
            {saving ? '保存中…' : '保存修改'}
          </button>
        )}
        {status !== null && (
          <span role="status" className="text-xs text-[var(--muted-foreground)]">
            {status}
          </span>
        )}
      </div>
    </div>
  )
}
