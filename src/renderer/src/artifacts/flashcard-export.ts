/**
 * Flashcard export helpers (F13).
 *
 * Pure formatting functions plus a small browser download helper, so
 * the export logic is unit-testable without Electron.
 */

import type { Flashcard } from '../../../shared/schemas/artifact'

/** Markdown export: readable in any editor. */
export function flashcardsToMarkdown(title: string, cards: Flashcard[]): string {
  const lines: string[] = [
    `# ${title} · 闪卡`,
    '',
    `> 共 ${cards.length} 张 · 由 Socratopia-Local 导出`,
    ''
  ]

  cards.forEach((card, index) => {
    lines.push(`## ${index + 1}. ${card.question}`, '')
    lines.push(`**答案**：${card.answer}`, '')
    if (card.explanation.trim().length > 0) {
      lines.push(`**解析**：${card.explanation}`, '')
    }
    lines.push('---', '')
  })

  return lines.join('\n')
}

/**
 * TSV export for Anki: `question<TAB>answer`, one card per line.
 * Newlines inside fields are flattened so each card stays on one row.
 */
export function flashcardsToTsv(cards: Flashcard[]): string {
  const flatten = (value: string): string => value.replace(/\s*\n\s*/g, ' ').trim()
  return cards
    .map((card) => `${flatten(card.question)}\t${flatten(card.answer)}`)
    .join('\n')
}

/** Trigger a local file download in the renderer. */
export function downloadTextFile(
  filename: string,
  content: string,
  mime = 'text/plain'
): void {
  if (
    typeof document === 'undefined' ||
    typeof URL === 'undefined' ||
    typeof URL.createObjectURL !== 'function'
  ) {
    return
  }

  const blob = new Blob([content], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

/** Sanitise a conversation title for use in a file name. */
export function exportFileName(title: string, extension: string): string {
  const base = title.replace(/[\\/:*?"<>|]/g, '_').trim() || 'flashcards'
  return `${base}-闪卡.${extension}`
}
