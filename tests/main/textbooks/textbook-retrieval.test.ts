/**
 * Tests for textbook segmentation and keyword retrieval (F02).
 */
import { describe, expect, it } from 'vitest'

import { segmentTextbook } from '../../../src/main/textbooks/textbook-index'
import {
  extractTerms,
  retrieveSegments
} from '../../../src/main/textbooks/textbook-retrieval'

const TEXTBOOK = `# 第一章 惯性

物体保持静止或匀速直线运动的性质叫做惯性。

# 第二章 浮力

浸在液体中的物体受到向上的浮力，浮力大小等于排开液体的重力。

阿基米德原理可以用公式 F = ρgV 表示。`

describe('segmentTextbook', () => {
  it('splits paragraphs and anchors them to the nearest heading', () => {
    const segments = segmentTextbook(TEXTBOOK)

    expect(segments).toHaveLength(3)
    expect(segments[0].heading).toBe('第一章 惯性')
    expect(segments[0].label).toBe('第一章 惯性 · 第 1 段')
    expect(segments[0].segmentId).toBe('seg_1')
    expect(segments[1].heading).toBe('第二章 浮力')
    expect(segments[2].label).toBe('第二章 浮力 · 第 2 段')
  })

  it('handles text without headings and merges tiny fragments', () => {
    const segments = segmentTextbook('第一段内容。\n\n-\n\n第二段内容。')
    expect(segments).toHaveLength(2)
    expect(segments[0].heading).toBe('')
    expect(segments[0].label).toBe('第 1 段')
    expect(segments[0].text).toContain('-')
  })

  it('returns an empty array for empty content', () => {
    expect(segmentTextbook('   \n\n')).toEqual([])
  })
})

describe('extractTerms', () => {
  it('extracts Latin words and CJK bigrams', () => {
    const terms = extractTerms('什么是 Inertia 原理？')
    expect(terms).toContain('inertia')
    expect(terms).toContain('什么')
    expect(terms).toContain('原理')
    expect(terms).not.toContain('惯性')
  })
})

describe('retrieveSegments', () => {
  it('finds the paragraph matching the question', () => {
    const segments = segmentTextbook(TEXTBOOK)
    const hits = retrieveSegments(segments, '什么是惯性？', 3)

    expect(hits).toHaveLength(1)
    expect(hits[0].segmentId).toBe('seg_1')
    expect(hits[0].index).toBe(1)
    expect(hits[0].text).toContain('物体保持静止')
    expect(hits[0].score).toBeGreaterThan(0)
  })

  it('ranks the strongest match first and respects the limit', () => {
    const segments = segmentTextbook(
      `${TEXTBOOK}\n\n惯性也出现在刹车的情境里，因为身体有惯性。`
    )
    const hits = retrieveSegments(segments, '刹车时惯性', 1)
    expect(hits).toHaveLength(1)
    expect(hits[0].text).toContain('刹车')
  })

  it('returns nothing when no term matches', () => {
    const segments = segmentTextbook(TEXTBOOK)
    expect(retrieveSegments(segments, '量子纠缠', 3)).toEqual([])
  })

  it('returns nothing for an empty or punctuation-only query', () => {
    const segments = segmentTextbook(TEXTBOOK)
    expect(retrieveSegments(segments, '  ', 3)).toEqual([])
    expect(retrieveSegments(segments, '？？', 3)).toEqual([])
  })
})
