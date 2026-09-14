/**
 * Tests for flashcard export formatting (F13).
 */
import { describe, expect, it } from 'vitest'

import {
  exportFileName,
  flashcardsToMarkdown,
  flashcardsToTsv
} from '../../src/renderer/src/artifacts/flashcard-export'
import type { Flashcard } from '../../src/shared/schemas/artifact'

const cards: Flashcard[] = [
  {
    question: '什么是惯性？',
    answer: '物体保持原有运动状态的性质',
    explanation: '来自第一章'
  },
  {
    question: '为什么刹车时人会前倾？\n想想看',
    answer: '因为身体有惯性',
    explanation: ''
  }
]

describe('flashcardsToMarkdown', () => {
  it('renders every card with answer and explanation', () => {
    const markdown = flashcardsToMarkdown('惯性课', cards)

    expect(markdown).toContain('# 惯性课 · 闪卡')
    expect(markdown).toContain('## 1. 什么是惯性？')
    expect(markdown).toContain('**答案**：物体保持原有运动状态的性质')
    expect(markdown).toContain('**解析**：来自第一章')
    expect(markdown).toContain('## 2.')
    expect(markdown).toContain('共 2 张')
  })

  it('omits the explanation line when empty', () => {
    const markdown = flashcardsToMarkdown('惯性课', [cards[1]])
    expect(markdown).not.toContain('**解析**')
  })
})

describe('flashcardsToTsv', () => {
  it('produces one tab-separated line per card and flattens newlines', () => {
    const tsv = flashcardsToTsv(cards)
    const lines = tsv.split('\n')

    expect(lines).toHaveLength(2)
    expect(lines[0]).toBe('什么是惯性？\t物体保持原有运动状态的性质')
    expect(lines[1]).toBe('为什么刹车时人会前倾？ 想想看\t因为身体有惯性')
  })
})

describe('exportFileName', () => {
  it('sanitises path-hostile characters', () => {
    expect(exportFileName('惯性/课: 第一讲', 'md')).toBe('惯性_课_ 第一讲-闪卡.md')
  })

  it('falls back when the title is empty', () => {
    expect(exportFileName('   ', 'txt')).toBe('flashcards-闪卡.txt')
  })
})
