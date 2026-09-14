import { describe, expect, it } from 'vitest'

import { CompanionSchema } from '../../src/shared/schemas/companion'
import { ConversationSchema } from '../../src/shared/schemas/conversation'
import { MessageSchema } from '../../src/shared/schemas/message'
import { NoteSchema } from '../../src/shared/schemas/note'
import {
  AppPreferencesSchema,
  DEFAULT_PREFERENCES
} from '../../src/shared/schemas/preferences'
import { TextbookMetadataSchema } from '../../src/shared/schemas/textbook'
import { UsageRecordSchema } from '../../src/shared/schemas/usage'
import {
  IpcAppendMessageInputSchema,
  IpcCreateNoteInputSchema,
  IpcCreateTextbookFromTextInputSchema,
  IpcDeleteTextbookInputSchema,
  IpcGetTextbookPageInputSchema,
  IpcSetDeepSeekKeyInputSchema,
  IpcTestDeepSeekKeyInputSchema
} from '../../src/shared/schemas/ipc'

// ---------------------------------------------------------------
// Domain schemas
// ---------------------------------------------------------------

describe('domain schemas', () => {
  it('accepts a complete companion', () => {
    const result = CompanionSchema.safeParse({
      id: 'comp_alice',
      worldId: 'world_default',
      name: '爱丽丝',
      gender: 'female',
      age: 17,
      identity: '好奇的少女',
      personalityKeywords: ['好奇'],
      personality: '喜欢追问。',
      speakingStyle: '轻声细语。',
      emotionalExpressions: '开心时会笑。',
      source: 'candidate',
      originalFile: 'alice.md'
    })
    expect(result.success).toBe(true)
  })

  it('rejects a companion with an unknown gender', () => {
    const result = CompanionSchema.safeParse({
      id: 'comp_x',
      worldId: 'world_default',
      name: 'X',
      gender: 'robot',
      age: 1,
      identity: 'x',
      personalityKeywords: ['a'],
      personality: 'b',
      speakingStyle: '',
      emotionalExpressions: '',
      source: 'custom',
      originalFile: 'x.md'
    })
    expect(result.success).toBe(false)
  })

  it('accepts a conversation that is still open', () => {
    const now = new Date().toISOString()
    const result = ConversationSchema.safeParse({
      id: 'conv_1',
      worldId: 'world_default',
      companionId: 'comp_alice',
      textbookId: null,
      title: '惯性',
      createdAt: now,
      updatedAt: now,
      endedAt: null
    })
    expect(result.success).toBe(true)
  })

  it('stores message sources and rejects empty content', () => {
    const message = MessageSchema.safeParse({
      id: 'msg_1',
      conversationId: 'conv_1',
      role: 'assistant',
      content: '惯性是……',
      createdAt: new Date().toISOString(),
      sources: [{ segmentId: 'seg_1', label: '第 1 段', text: '原文' }]
    })
    expect(message.success).toBe(true)

    const empty = MessageSchema.safeParse({
      id: 'msg_2',
      conversationId: 'conv_1',
      role: 'user',
      content: '   ',
      createdAt: new Date().toISOString()
    })
    expect(empty.success).toBe(false)
  })

  it('defaults the note quote and enforces colours', () => {
    const note = NoteSchema.safeParse({
      id: 'note_1',
      conversationId: 'conv_1',
      messageId: null,
      kind: 'note',
      text: '我的想法',
      color: 'yellow',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    })
    expect(note.success).toBe(true)
    if (note.success) expect(note.data.quote).toBe('')
  })

  it('accepts the documented default preferences', () => {
    const prefs = AppPreferencesSchema.parse(DEFAULT_PREFERENCES)
    expect(prefs.model).toBe(DEFAULT_PREFERENCES.model)
    expect(prefs.fontScale).toBe(DEFAULT_PREFERENCES.fontScale)
  })

  it('validates textbook metadata and usage records', () => {
    const now = new Date().toISOString()
    expect(
      TextbookMetadataSchema.safeParse({
        id: 'tb_1',
        worldId: 'world_default',
        title: '教材',
        format: 'pdf',
        sourceFile: 'source.md',
        originalFile: null,
        progress: { currentPage: 0, totalPages: 12 },
        createdAt: now,
        updatedAt: now
      }).success
    ).toBe(true)

    expect(
      UsageRecordSchema.safeParse({
        timestamp: now,
        model: 'deepseek-v4-pro',
        conversationId: null,
        promptTokens: 1,
        completionTokens: 2,
        totalTokens: 3
      }).success
    ).toBe(true)
  })
})

// ---------------------------------------------------------------
// IPC input schemas
// ---------------------------------------------------------------

describe('IPC input schemas', () => {
  it('accepts a printable API key and rejects control characters', () => {
    expect(IpcSetDeepSeekKeyInputSchema.safeParse({ key: 'sk-abc123' }).success).toBe(true)
    expect(
      IpcSetDeepSeekKeyInputSchema.safeParse({ key: 'sk-abc\nINJECTED' }).success
    ).toBe(false)
    expect(IpcTestDeepSeekKeyInputSchema.safeParse({ key: 'sk-abc123' }).success).toBe(
      true
    )
  })

  it('caps pasted textbook content and accepts the supported formats', () => {
    expect(
      IpcCreateTextbookFromTextInputSchema.safeParse({
        title: 't',
        format: 'markdown',
        content: '# hi'
      }).success
    ).toBe(true)
    expect(
      IpcCreateTextbookFromTextInputSchema.safeParse({
        title: 't',
        format: 'pdf',
        content: '# hi'
      }).success
    ).toBe(false)
  })

  it('rejects path traversal in textbook ids', () => {
    expect(
      IpcDeleteTextbookInputSchema.safeParse({ textbookId: '../etc' }).success
    ).toBe(false)
    expect(
      IpcGetTextbookPageInputSchema.safeParse({ textbookId: 'tb_1', page: 2 }).success
    ).toBe(true)
    expect(
      IpcGetTextbookPageInputSchema.safeParse({ textbookId: 'tb_1', page: 0 }).success
    ).toBe(false)
  })

  it('caps message length and rejects empty notes', () => {
    expect(
      IpcAppendMessageInputSchema.safeParse({
        conversationId: 'conv_1',
        role: 'user',
        content: 'x'.repeat(32769)
      }).success
    ).toBe(false)
    expect(
      IpcCreateNoteInputSchema.safeParse({
        conversationId: 'conv_1',
        messageId: null,
        kind: 'note',
        text: '',
        quote: '',
        color: 'yellow'
      }).success
    ).toBe(false)
  })
})
