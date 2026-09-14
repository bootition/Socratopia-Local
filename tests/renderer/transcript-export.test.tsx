/**
 * Tests for whole-lesson Markdown export (F33).
 */
import { describe, expect, it } from 'vitest'

import {
  buildTranscriptMarkdown,
  transcriptFileName
} from '../../src/renderer/src/history/transcript-export'
import type { Message } from '../../src/shared/schemas/message'
import type { Note } from '../../src/shared/schemas/note'
import { ArtifactStatus, type EndClassRecord } from '../../src/shared/schemas/artifact'

const messages: Message[] = [
  {
    id: 'msg_1' as Message['id'],
    conversationId: 'conv_1' as Message['conversationId'],
    role: 'user',
    content: '什么是惯性？',
    createdAt: '2026-09-14T09:05:00.000Z'
  },
  {
    id: 'msg_2' as Message['id'],
    conversationId: 'conv_1' as Message['conversationId'],
    role: 'assistant',
    content: '想想刹车时人会怎样。',
    createdAt: '2026-09-14T09:06:00.000Z',
    sources: [
      {
        segmentId: 'seg_1',
        label: '第一章 惯性 · 第 1 段',
        text: '物体保持静止或匀速直线运动。'
      }
    ]
  }
]

const notes: Note[] = [
  {
    id: 'note_1',
    conversationId: 'conv_1',
    messageId: 'msg_2',
    kind: 'note',
    text: '这里我没听懂',
    quote: '物体保持静止或匀速直线运动。',
    color: 'green',
    createdAt: '2026-09-14T09:07:00.000Z',
    updatedAt: '2026-09-14T09:07:00.000Z'
  }
]

const artifacts: EndClassRecord = {
  conversationId: 'conv_1',
  generatedAt: '2026-09-14T10:00:00.000Z',
  model: 'deepseek-v4-pro',
  farewell: '下次见。',
  status: {
    lesson_summary: ArtifactStatus.Complete,
    flashcards: ArtifactStatus.Complete,
    diary: ArtifactStatus.Complete,
    progress: ArtifactStatus.Complete,
    handoff_tail: ArtifactStatus.Complete
  },
  summary: '本节理解惯性的直觉。',
  flashcards: [{ question: '什么是惯性？', answer: '保持运动状态', explanation: '第一段' }],
  diary: '今天学了惯性。',
  progress: '当前页码：2',
  handoffTail: [],
  rawOutputFile: null
}

describe('buildTranscriptMarkdown', () => {
  it('renders messages, sources, notes and artifacts', () => {
    const markdown = buildTranscriptMarkdown({
      title: '惯性课',
      companionName: 'Alice',
      messages,
      notes,
      artifacts,
      exportedAt: new Date('2026-09-14T12:00:00.000Z')
    })

    expect(markdown).toContain('# 惯性课')
    expect(markdown).toContain('- 同伴：Alice')
    expect(markdown).toContain('### 学习者')
    expect(markdown).toContain('什么是惯性？')
    expect(markdown).toContain('> **来源**')
    expect(markdown).toContain('第一章 惯性 · 第 1 段')
    expect(markdown).toContain('## 课堂笔记')
    expect(markdown).toContain('这里我没听懂')
    expect(markdown).toContain('## 课后产物')
    expect(markdown).toContain('### 课堂总结')
    expect(markdown).toContain('1. **什么是惯性？** — 保持运动状态')
    expect(markdown).toContain('当前页码：2')
  })

  it('works without notes or artifacts', () => {
    const markdown = buildTranscriptMarkdown({ title: '空课', messages: [] })
    expect(markdown).toContain('# 空课')
    expect(markdown).toContain('- 消息数：0')
    expect(markdown).not.toContain('## 课后产物')
  })
})

describe('transcriptFileName', () => {
  it('sanitises path characters and keeps the extension', () => {
    expect(transcriptFileName('惯性/课: 第一讲')).toBe('惯性_课_ 第一讲-课堂记录.md')
    expect(transcriptFileName('   ')).toBe('lesson-课堂记录.md')
  })
})

describe('transcript HTML safety', () => {
  it('escapes lines that a Markdown viewer could parse as raw HTML', () => {
    const message: Message = {
      id: 'msg_html' as Message['id'],
      conversationId: 'conv_1' as Message['conversationId'],
      role: 'assistant',
      content: '<img src=x onerror="alert(1)">\nnormal line',
      createdAt: '2026-09-14T09:10:00.000Z'
    }
    const markdown = buildTranscriptMarkdown({ title: '安全', messages: [message] })
    expect(markdown).toContain('\\<img src=x onerror="alert(1)">')
    expect(markdown).toContain('normal line')
  })
})
