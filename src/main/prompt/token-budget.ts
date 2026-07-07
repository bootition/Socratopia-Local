/**
 * Token budgeting utilities.
 *
 * Provides rough token estimation based on CJK/non-CJK character proportions,
 * content truncation with markers, and conversation history windowing.
 *
 * The token estimation formula mirrors Socratopia v2.1.1's approach
 * (reference/prompt-结构/tool-definitions.md):
 *   - CJK characters = 1 token each
 *   - Non-CJK characters ≈ 0.25 tokens each (4 chars ≈ 1 token)
 *
 * CJK Unicode ranges:
 *   - 0x4E00-0x9FFF  — CJK Unified Ideographs
 *   - 0x3400-0x4DBF  — CJK Extension A
 *   - 0x20000-0x2A6DF — CJK Extension B
 *   - 0x3040-0x309F  — Hiragana
 *   - 0x30A0-0x30FF  — Katakana
 *   - 0xAC00-0xD7AF  — Hangul
 */

import type { DeepSeekChatMessage } from '../llm/types'

const TRUNCATION_MARKER = '\n\n[内容已截断——超出上下文长度限制]'

/**
 * Check if a Unicode code point falls in a CJK range.
 */
function isCJK(codePoint: number): boolean {
  return (
    (codePoint >= 0x4e00 && codePoint <= 0x9fff) ||   // CJK Unified Ideographs
    (codePoint >= 0x3400 && codePoint <= 0x4dbf) ||   // CJK Extension A
    (codePoint >= 0x20000 && codePoint <= 0x2a6df) || // CJK Extension B
    (codePoint >= 0x3040 && codePoint <= 0x309f) ||   // Hiragana
    (codePoint >= 0x30a0 && codePoint <= 0x30ff) ||   // Katakana
    (codePoint >= 0xac00 && codePoint <= 0xd7af)      // Hangul
  )
}

/**
 * Roughly estimate token count for a string.
 *
 * CJK characters count as ~1 token each.
 * Non-CJK characters count as ~0.25 tokens each.
 * Returns a ceiling integer.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0

  let tokens = 0
  for (const char of text) {
    const codePoint = char.codePointAt(0) ?? 0
    if (isCJK(codePoint)) {
      tokens += 1
    } else {
      tokens += 0.25
    }
  }

  return Math.ceil(tokens)
}

/**
 * Truncate text to fit within a token budget.
 *
 * Walks through characters, accumulating token cost, and cuts at the
 * point where the budget would be exceeded. A truncation marker is
 * appended to truncated content.
 *
 * @param text       The text to potentially truncate.
 * @param maxTokens  Maximum allowed tokens (estimation).
 * @returns          Original text if within budget, or truncated text + marker.
 */
export function truncateToBudget(text: string, maxTokens: number): string {
  if (maxTokens <= 0) return ''

  if (estimateTokens(text) <= maxTokens) {
    return text
  }

  // Account for the truncation marker's token cost
  const markerTokens = estimateTokens(TRUNCATION_MARKER)
  const contentBudget = maxTokens - markerTokens
  if (contentBudget <= 0) return TRUNCATION_MARKER.trim()

  let accumulated = 0
  let cutIndex = 0

  // Iterate over code points (for...of), not UTF-16 code units.
  // char.length is 2 for surrogate pairs, 1 otherwise — so cutIndex
  // tracks the correct code-unit offset for text.slice().
  for (const char of text) {
    const codePoint = char.codePointAt(0) ?? 0
    const cost = isCJK(codePoint) ? 1 : 0.25

    if (accumulated + cost > contentBudget) {
      break
    }
    accumulated += cost
    cutIndex += char.length
  }

  return text.slice(0, cutIndex) + TRUNCATION_MARKER
}

/**
 * Window conversation history to fit within a token budget.
 *
 * Keeps the most recent messages while respecting the budget.
 * System messages at the start are always preserved and their token
 * cost is excluded from the budget calculation (system prompt is
 * handled separately by the caller).
 *
 * @param messages   Full conversation history.
 * @param maxTokens  Maximum allowed tokens for windowed history.
 * @returns          Windowed messages (most recent fit within budget).
 */
export function windowMessages(
  messages: DeepSeekChatMessage[],
  maxTokens: number
): DeepSeekChatMessage[] {
  if (messages.length === 0) return []

  // Separate system messages — they are preserved
  const systemMsgs = messages.filter(m => m.role === 'system')
  const nonSystemMsgs = messages.filter(m => m.role !== 'system')

  // Walk backwards from the most recent non-system message,
  // accumulating until we hit the budget
  const windowed: DeepSeekChatMessage[] = []
  let budgetUsed = 0

  for (let i = nonSystemMsgs.length - 1; i >= 0; i--) {
    const msg = nonSystemMsgs[i]
    const msgTokens = estimateTokens(msg.content)

    if (budgetUsed + msgTokens > maxTokens && windowed.length > 0) {
      break
    }

    windowed.unshift(msg)
    budgetUsed += msgTokens

    if (budgetUsed >= maxTokens) break
  }

  // Prepend system messages (they were at the start)
  return [...systemMsgs, ...windowed]
}
