import { describe, it, expect } from 'vitest'
import { estimateTokens, truncateToBudget, windowMessages } from '../../../src/main/prompt/token-budget'
import type { DeepSeekChatMessage } from '../../../src/main/llm/types'

describe('estimateTokens', () => {
  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0)
  })

  it('counts CJK characters as 1 token each', () => {
    // 5 Chinese characters → ~5 tokens
    expect(estimateTokens('你好世界！')).toBeGreaterThanOrEqual(4)
  })

  it('counts ASCII characters as ~0.25 tokens each (4 chars ≈ 1 token)', () => {
    // 20 ASCII chars → ~5 tokens
    expect(estimateTokens('Hello World! Howdy?')).toBeGreaterThanOrEqual(4)
    expect(estimateTokens('Hello World! Howdy?')).toBeLessThanOrEqual(10)
  })

  it('handles mixed CJK + ASCII text', () => {
    const result = estimateTokens('你好世界Hello')
    // 4 CJK chars (~4 tokens) + 5 ASCII (~1.25 tokens) ≈ 5-6
    expect(result).toBeGreaterThan(3)
  })

  it('returns non-zero for a long paragraph', () => {
    const text = '这是一段比较长的中文文本，用于测试 token 估算功能' +
      '是否能够正确处理中英文混合的情况。'
    expect(estimateTokens(text)).toBeGreaterThan(20)
  })

  it('does not double-count surrogate pairs (emoji)', () => {
    // 😀 = U+1F600, UTF-16: [0xD83D, 0xDE00] — 2 code units, 1 code point
    // If code incorrectly iterates over code units, it counts low surrogate
    // as separate char → inflates token count
    const singleEmoji = '😀'
    const tokens = estimateTokens(singleEmoji)
    // Emoji is non-CJK → 0.25 tokens per code point → ceil(0.25) = 1
    // Bug would yield ceil(0.25 + 0.25) = 1 too, so check with multiple
    const fourEmoji = '😀😀😀😀'
    const tokens4 = estimateTokens(fourEmoji)
    // 4 code points × 0.25 = 1.0 → ceil(1.0) = 1
    // Bug (double-counting surrogates): 8 code units × 0.25 = 2.0 → ceil = 2
    expect(tokens4).toBe(1)
  })

  it('correctly identifies SMP CJK char as CJK (not double-counted)', () => {
    // 𠀋 = U+2000B, UTF-16: [0xD840, 0xDC0B] — CJK Extension B (0x20000-0x2A6DF)
    // 2 code units, 1 code point, CJK → 1 token
    // Bug (iterating code units): low surrogate misidentified as non-CJK → +0.25
    const smpCJK = '𠀋'
    const tokens = estimateTokens(smpCJK)
    // Should be exactly 1 (CJK) — ceil(1.0) = 1
    // Bug: high surrogate = CJK (1), low surrogate = non-CJK (0.25) → 2
    expect(tokens).toBe(1)
  })

  it('handles mixed emoji + ASCII + CJK correctly', () => {
    const text = '你好😀世界'  // 2 CJK + 1 emoji + 2 CJK
    const tokens = estimateTokens(text)
    // 4 CJK × 1 + 1 emoji × 0.25 = 4.25 → ceil = 5
    // Bug (double-count surrogates): +extra 0.25 for low surrogate
    expect(tokens).toBe(5)
  })
})

describe('truncateToBudget', () => {
  const shortText = 'Hello World'

  it('returns text unchanged when under budget', () => {
    const result = truncateToBudget(shortText, 100)
    expect(result).toBe(shortText)
  })

  it('truncates long text to stay within budget', () => {
    const longText = '这是一段' + '非常长'.repeat(200) + '的文本内容'
    const budget = 100
    const result = truncateToBudget(longText, budget)

    expect(result.length).toBeLessThan(longText.length)
    expect(estimateTokens(result)).toBeLessThanOrEqual(budget + 10) // small margin
  })

  it('includes a truncation marker in truncated output', () => {
    const longText = 'A'.repeat(1000)
    const result = truncateToBudget(longText, 50)

    expect(result).toMatch(/截断|truncat|省略/i)
    expect(result).not.toBe(longText)
  })

  it('returns empty string for 0 budget', () => {
    const result = truncateToBudget('some text', 0)
    // Either empty or minimal marker
    expect(result.length).toBeLessThanOrEqual(20)
  })

  it('truncation preserves content from the start of the text', () => {
    const text = 'START: ' + 'content '.repeat(500) + 'END'
    const result = truncateToBudget(text, 100)

    // Should contain beginning content, not the end
    expect(result).toContain('START')
  })

  it('does not cut in the middle of a surrogate pair (emoji)', () => {
    // 😀 = U+1F600, UTF-16: [0xD83D, 0xDE00], non-CJK → 0.25 tokens each
    // Pattern: '😀x' repeated. Each group = 3 code units × 0.25 = 0.75 tokens.
    // contentBudget=7 → 9 full groups + 1 high surrogate = cutIndex=28 (broken).
    // Budget = markerTokens(16) + contentBudget(7) = 23.
    const emojiStr = '😀x'.repeat(100)
    const budget = 23
    const result = truncateToBudget(emojiStr, budget)

    // Strip the marker to inspect the content
    const markerStr = '\n\n[内容已截断——超出上下文长度限制]'
    const content = result.endsWith(markerStr)
      ? result.slice(0, result.length - markerStr.length)
      : result

    // Verify no orphan surrogates in the truncated content
    for (const char of content) {
      const code = char.codePointAt(0)!
      expect(code < 0xD800 || code > 0xDFFF).toBe(true)
    }
  })

  it('does not cut in the middle of an SMP CJK surrogate pair', () => {
    // 𠀋 = U+2000B (CJK Extension B), UTF-16: [0xD840, 0xDC0B], CJK → 1 token
    // Bug loop: high surr = CJK (1), low surr = non-CJK (0.25) → 1.25 per char
    // contentBudget=6 → 4 full 𠀋 + 1 high surrogate = cutIndex=9 (broken).
    // Budget = markerTokens(16) + contentBudget(6) = 22.
    const smpStr = '𠀋'.repeat(100)
    const budget = 22
    const result = truncateToBudget(smpStr, budget)

    const markerStr = '\n\n[内容已截断——超出上下文长度限制]'
    const content = result.endsWith(markerStr)
      ? result.slice(0, result.length - markerStr.length)
      : result

    for (const char of content) {
      const code = char.codePointAt(0)!
      expect(code < 0xD800 || code > 0xDFFF).toBe(true)
    }
  })
})

describe('windowMessages', () => {
  const makeMsg = (role: 'system' | 'user' | 'assistant', content: string): DeepSeekChatMessage => ({
    role,
    content
  })

  it('returns empty array for empty input', () => {
    expect(windowMessages([], 100)).toEqual([])
  })

  it('returns all messages when under budget', () => {
    const msgs = [makeMsg('user', 'Hi'), makeMsg('assistant', 'Hello!')]
    expect(windowMessages(msgs, 1000)).toEqual(msgs)
  })

  it('keeps most recent messages when over budget', () => {
    const msgs = [
      makeMsg('user', 'A'.repeat(500)),
      makeMsg('assistant', 'B'.repeat(500)),
      makeMsg('user', 'C'),
      makeMsg('assistant', 'D')
    ]
    const result = windowMessages(msgs, 200)

    expect(result.length).toBeLessThan(msgs.length)
    // The last messages (C, D) should be preserved
    expect(result.some(m => m.content === 'C')).toBe(true)
    expect(result.some(m => m.content === 'D')).toBe(true)
  })

  it('never returns more messages than input', () => {
    const msgs = [makeMsg('user', 'Hello'), makeMsg('assistant', 'Hi')]
    const result = windowMessages(msgs, 10)
    expect(result.length).toBeLessThanOrEqual(msgs.length)
  })

  it('system messages are not removed by windowing', () => {
    const msgs = [
      makeMsg('system', 'system prompt'),
      makeMsg('user', 'A'),
      makeMsg('assistant', 'B')
    ]
    const result = windowMessages(msgs, 50)

    // system message should still be present
    expect(result.some(m => m.role === 'system')).toBe(true)
  })
})
