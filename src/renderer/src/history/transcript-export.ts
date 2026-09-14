/**
 * Whole-lesson Markdown export (F33).
 *
 * Pure formatting: the caller loads messages, notes and artifacts and
 * passes them in, so this module stays testable without Electron.
 */

import type { EndClassRecord } from '../../../shared/schemas/artifact'
import type { Message, MessageSource } from '../../../shared/schemas/message'
import type { Note } from '../../../shared/schemas/note'

export interface TranscriptExportInput {
  title: string
  companionName?: string | null
  messages: Message[]
  notes?: Note[]
  artifacts?: EndClassRecord | null
  /** Injected for deterministic tests. */
  exportedAt?: Date
}

/**
 * Escape HTML-looking text so a Markdown viewer cannot render or execute
 * it. Covers both block tags at line start and inline tags mid-line,
 * while leaving ordinary math (`a < b`) untouched.
 */
function escapeRawHtml(text: string): string {
  return text.replace(/</g, (match, offset: number, full: string) => {
    const next = full[offset + 1]
    return next !== undefined && /[a-zA-Z/!?]/.test(next) ? `\\<` : match
  })
}

/** Escape every line of a multi-line model/user output. */
function escapeBlock(text: string): string {
  return text
    .split('\n')
    .map((line) => escapeRawHtml(line))
    .join('\n')
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString('zh-CN')
}

function formatSources(sources: MessageSource[] | undefined): string[] {
  if (sources === undefined || sources.length === 0) return []
  const lines = ['', '> **来源**']
  for (const source of sources) {
    lines.push(`> - ${source.label}：${source.text.replace(/\n/g, ' ')}`)
  }
  return lines
}

/** Build a complete lesson transcript in Markdown. */
export function buildTranscriptMarkdown(input: TranscriptExportInput): string {
  const exportedAt = input.exportedAt ?? new Date()
  const lines: string[] = [
    `# ${input.title}`,
    '',
    `- 导出时间：${formatTimestamp(exportedAt.toISOString())}`,
    `- 消息数：${input.messages.length}`
  ]

  if (input.companionName !== undefined && input.companionName !== null) {
    lines.push(`- 同伴：${input.companionName}`)
  }

  lines.push('', '## 课堂记录', '')

  for (const message of input.messages) {
    if (message.role === 'system') {
      lines.push(`> ${message.content}`, '')
      continue
    }
    const speaker = message.role === 'user' ? '学习者' : '同伴'
    lines.push(`### ${speaker} · ${formatTimestamp(message.createdAt)}`, '')
    lines.push(
      message.content
        .split('\n')
        .map((line) => escapeRawHtml(line))
        .join('\n'),
      ''
    )
    lines.push(...formatSources(message.sources))
    if (message.sources !== undefined && message.sources.length > 0) lines.push('')
  }

  const notes = input.notes ?? []
  if (notes.length > 0) {
    lines.push('## 课堂笔记', '')
    for (const note of notes) {
      const label = note.kind === 'highlight' ? '高亮' : '笔记'
      if (note.quote.length > 0) {
        lines.push(`> ${escapeRawHtml(note.quote.replace(/\n/g, ' '))}`, '')
      }
      lines.push(`- **${label}**（${note.color}）：${escapeRawHtml(note.text)}`)
    }
    lines.push('')
  }

  const artifacts = input.artifacts
  if (artifacts !== null && artifacts !== undefined) {
    lines.push('## 课后产物', '')

    if (artifacts.summary !== null) {
      lines.push('### 课堂总结', '', artifacts.summary, '')
    }
    if (artifacts.flashcards !== null && artifacts.flashcards.length > 0) {
      lines.push('### 闪卡', '')
      artifacts.flashcards.forEach((card, index) => {
        lines.push(`${index + 1}. **${card.question}** — ${card.answer}`)
        if (card.explanation.trim().length > 0) {
          lines.push(`   - 解析：${card.explanation}`)
        }
      })
      lines.push('')
    }
    if (artifacts.progress !== null) {
      lines.push('### 学习进度', '', artifacts.progress, '')
    }
    if (artifacts.diary !== null) {
      lines.push('### 日记', '', artifacts.diary, '')
    }
  }

  return lines.join('\n')
}

/** Sanitised file name for the exported lesson. */
export function transcriptFileName(title: string): string {
  const base = title.replace(/[\\/:*?"<>|]/g, '_').trim() || 'lesson'
  return `${base}-课堂记录.md`
}
