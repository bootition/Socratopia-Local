/**
 * Tests for the end-class `===TAG===` parser.
 *
 * Pure function tests: no fs, no LLM.
 */
import { describe, it, expect } from 'vitest'

import {
  parseEndClassOutput,
  splitEndClassSections,
  EndClassParseError
} from '../../../src/main/artifacts/artifact-parser'
import { ArtifactType } from '../../../src/shared/types/ids'

const VALID_OUTPUT = `===FAREWELL===
那么，下次见。

===SUMMARY_MD===
本节从惯性出发，理解了力与运动的关系。

===FLASHCARDS_JSON===
[{"question": "什么是惯性？", "answer": "物体保持原有运动状态的性质", "explanation": "来自第一段"}]

===DIARY_ENTRY===
## 2026-09-14
今天和 Alice 一起读了牛顿力学，我明白了惯性。

===PROGRESS_MD===
当前页码：2
完成第一章前半，掌握较好，下次从惯性定律的例题继续。

===HANDOFF_TAIL_JSON===
[{"role": "user", "content": "什么是惯性？"}, {"role": "assistant", "content": "想想看……"}]

===END===`

describe('splitEndClassSections', () => {
  it('splits tagged sections and keeps multiline content', () => {
    const sections = splitEndClassSections(VALID_OUTPUT)
    expect(sections.FAREWELL).toBe('那么，下次见。')
    expect(sections.SUMMARY_MD).toContain('力与运动')
    expect(sections.PROGRESS_MD).toContain('当前页码：2')
  })
})

describe('parseEndClassOutput', () => {
  it('parses a full valid response', () => {
    const parsed = parseEndClassOutput(VALID_OUTPUT)

    expect(parsed.farewell).toBe('那么，下次见。')
    expect(parsed.summary).toContain('惯性')
    expect(parsed.flashcards).toHaveLength(1)
    expect(parsed.flashcards![0].question).toBe('什么是惯性？')
    expect(parsed.diary).toContain('Alice')
    expect(parsed.progress).toContain('当前页码：2')
    expect(parsed.handoffTail).toHaveLength(2)
    expect(parsed.failed).toEqual([])
  })

  it('accepts code-fenced JSON sections', () => {
    const output = VALID_OUTPUT.replace(
      '[{"question"',
      '```json\n[{"question"'
    ).replace('"explanation": "来自第一段"}]', '"explanation": "来自第一段"}]\n```')

    const parsed = parseEndClassOutput(output)
    expect(parsed.flashcards).toHaveLength(1)
    expect(parsed.failed).toEqual([])
  })

  it('throws when the farewell section is missing', () => {
    const output = VALID_OUTPUT.replace('===FAREWELL===', '===SOMETHING_ELSE===')
    expect(() => parseEndClassOutput(output)).toThrow(EndClassParseError)
  })

  it('marks missing sections as failed but keeps the rest', () => {
    const output = VALID_OUTPUT
      .replace(/===SUMMARY_MD===[\s\S]*?(?====FLASHCARDS_JSON===)/, '===SUMMARY_MD===\n\n')
      .replace(/===DIARY_ENTRY===[\s\S]*?(?====PROGRESS_MD===)/, '===DIARY_ENTRY===\n\n')

    const parsed = parseEndClassOutput(output)
    expect(parsed.summary).toBeNull()
    expect(parsed.diary).toBeNull()
    expect(parsed.progress).not.toBeNull()
    expect(parsed.failed).toContain(ArtifactType.LessonSummary)
    expect(parsed.failed).toContain(ArtifactType.Diary)
    expect(parsed.failed).not.toContain(ArtifactType.Progress)
  })

  it('marks malformed flashcards as failed without dropping other sections', () => {
    const output = VALID_OUTPUT.replace(
      /===FLASHCARDS_JSON===[\s\S]*?(?====DIARY_ENTRY===)/,
      '===FLASHCARDS_JSON===\nnot json at all\n'
    )

    const parsed = parseEndClassOutput(output)
    expect(parsed.flashcards).toBeNull()
    expect(parsed.failed).toContain(ArtifactType.Flashcards)
    expect(parsed.summary).not.toBeNull()
  })

  it('accepts an empty handoff tail array', () => {
    const output = VALID_OUTPUT.replace(
      /===HANDOFF_TAIL_JSON===[\s\S]*?(?====END===)/,
      '===HANDOFF_TAIL_JSON===\n[]\n'
    )

    const parsed = parseEndClassOutput(output)
    expect(parsed.handoffTail).toEqual([])
    expect(parsed.failed).not.toContain(ArtifactType.HandoffTail)
  })

  it('rejects handoff entries with an unknown role', () => {
    const output = VALID_OUTPUT.replace(
      '"role": "assistant"',
      '"role": "system"'
    )
    const parsed = parseEndClassOutput(output)
    expect(parsed.handoffTail).toBeNull()
    expect(parsed.failed).toContain(ArtifactType.HandoffTail)
  })
})
