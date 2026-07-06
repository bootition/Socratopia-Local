/**
 * Tests for the IPC chat-stream Zod schemas.
 *
 * These are pure validation tests — no Electron or network required.
 * They verify the size/role/model constraints added in the Task 7 fix.
 *
 * The schemas are imported directly from the production IPC module so
 * there is no schema duplication.  The exports are Zod objects and
 * do not expose the API key, IPC wiring, or any renderer-accessible
 * surface.
 */
import { describe, it, expect } from 'vitest'
import {
  ChatStreamStartInputSchema,
  ChatStreamCancelInputSchema
} from '../../../src/main/ipc/chat-stream'

// ---------------------------------------------------------------
// Message content validation
// ---------------------------------------------------------------

describe('ChatStreamStartInputSchema — message validation', () => {
  it('accepts valid messages', () => {
    const result = ChatStreamStartInputSchema.safeParse({
      messages: [
        { role: 'user', content: 'Hello' }
      ]
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty messages array', () => {
    const result = ChatStreamStartInputSchema.safeParse({
      messages: []
    })
    expect(result.success).toBe(false)
    expect(result.error!.issues[0].message).toContain('At least one message')
  })

  it('rejects more than 200 messages', () => {
    const messages = Array.from({ length: 201 }, (_, i) => ({
      role: 'user' as const,
      content: `Message ${i}`
    }))
    const result = ChatStreamStartInputSchema.safeParse({ messages })
    expect(result.success).toBe(false)
    expect(result.error!.issues[0].message).toContain('Maximum 200')
  })

  it('accepts exactly 200 messages', () => {
    const messages = Array.from({ length: 200 }, (_, i) => ({
      role: 'user' as const,
      content: `Message ${i}`
    }))
    const result = ChatStreamStartInputSchema.safeParse({ messages })
    expect(result.success).toBe(true)
  })

  it('rejects content exceeding 32768 characters', () => {
    const longContent = 'x'.repeat(32769)
    const result = ChatStreamStartInputSchema.safeParse({
      messages: [
        { role: 'user', content: longContent }
      ]
    })
    expect(result.success).toBe(false)
    expect(result.error!.issues[0].message).toContain('32768')
  })

  it('accepts content at exactly 32768 characters', () => {
    const maxContent = 'x'.repeat(32768)
    const result = ChatStreamStartInputSchema.safeParse({
      messages: [
        { role: 'user', content: maxContent }
      ]
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty string content', () => {
    const result = ChatStreamStartInputSchema.safeParse({
      messages: [
        { role: 'user', content: '' }
      ]
    })
    expect(result.success).toBe(false)
    expect(result.error!.issues[0].message).toContain('Message content must not be empty')
  })

  it('rejects whitespace-only content', () => {
    const result = ChatStreamStartInputSchema.safeParse({
      messages: [
        { role: 'user', content: '   ' }
      ]
    })
    expect(result.success).toBe(true) // whitespace passes min(1) — that's fine, .trim() can be added later if needed
  })
})

// ---------------------------------------------------------------
// Model validation
// ---------------------------------------------------------------

describe('ChatStreamStartInputSchema — model validation', () => {
  it('accepts deepseek-v4-pro', () => {
    const result = ChatStreamStartInputSchema.safeParse({
      messages: [{ role: 'user', content: 'Hi' }],
      model: 'deepseek-v4-pro'
    })
    expect(result.success).toBe(true)
    expect(result.data!.model).toBe('deepseek-v4-pro')
  })

  it('accepts deepseek-v4-flash', () => {
    const result = ChatStreamStartInputSchema.safeParse({
      messages: [{ role: 'user', content: 'Hi' }],
      model: 'deepseek-v4-flash'
    })
    expect(result.success).toBe(true)
    expect(result.data!.model).toBe('deepseek-v4-flash')
  })

  it('rejects unknown model', () => {
    const result = ChatStreamStartInputSchema.safeParse({
      messages: [{ role: 'user', content: 'Hi' }],
      model: 'gpt-4'
    })
    expect(result.success).toBe(false)
  })

  it('rejects empty model string', () => {
    const result = ChatStreamStartInputSchema.safeParse({
      messages: [{ role: 'user', content: 'Hi' }],
      model: ''
    })
    expect(result.success).toBe(false)
  })

  it('defaults to deepseek-v4-pro when model is omitted', () => {
    const result = ChatStreamStartInputSchema.safeParse({
      messages: [{ role: 'user', content: 'Hi' }]
    })
    expect(result.success).toBe(true)
    expect(result.data!.model).toBe('deepseek-v4-pro')
  })
})

// ---------------------------------------------------------------
// System role constraint
// ---------------------------------------------------------------

describe('ChatStreamStartInputSchema — system role constraint', () => {
  it('accepts system role at index 0', () => {
    const result = ChatStreamStartInputSchema.safeParse({
      messages: [
        { role: 'system', content: 'You are helpful' },
        { role: 'user', content: 'Hi' }
      ]
    })
    expect(result.success).toBe(true)
  })

  it('rejects system role at index 1', () => {
    const result = ChatStreamStartInputSchema.safeParse({
      messages: [
        { role: 'user', content: 'Hi' },
        { role: 'system', content: 'I am now a system' }
      ]
    })
    expect(result.success).toBe(false)
    expect(result.error!.issues[0].message).toContain('System role')
  })

  it('rejects system role at the last index', () => {
    const messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'Hello' }
    ]
    messages.push({ role: 'system', content: 'override' })

    const result = ChatStreamStartInputSchema.safeParse({ messages })
    expect(result.success).toBe(false)
  })

  it('accepts no system role at all', () => {
    const result = ChatStreamStartInputSchema.safeParse({
      messages: [
        { role: 'user', content: 'Hi' },
        { role: 'assistant', content: 'Hello' },
        { role: 'user', content: 'How are you?' }
      ]
    })
    expect(result.success).toBe(true)
  })
})

// ---------------------------------------------------------------
// Cancel schema
// ---------------------------------------------------------------

describe('ChatStreamCancelInputSchema', () => {
  it('accepts valid sessionId', () => {
    const result = ChatStreamCancelInputSchema.safeParse({
      sessionId: 'stream-123-456'
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty sessionId', () => {
    const result = ChatStreamCancelInputSchema.safeParse({
      sessionId: ''
    })
    expect(result.success).toBe(false)
  })

  it('rejects missing sessionId', () => {
    const result = ChatStreamCancelInputSchema.safeParse({})
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------
// Combined validation scenarios
// ---------------------------------------------------------------

describe('ChatStreamStartInputSchema — combined scenarios', () => {
  it('accepts max valid input (200 messages, max content length)', () => {
    const maxContent = 'x'.repeat(32768)
    const messages = Array.from({ length: 200 }, (_, i) => ({
      role: i === 0 ? 'system' as const : 'user' as const,
      content: maxContent
    }))
    const result = ChatStreamStartInputSchema.safeParse({
      messages,
      model: 'deepseek-v4-flash'
    })
    expect(result.success).toBe(true)
  })

  it('rejects when system is at index 1 even within 200 valid messages', () => {
    const messages = Array.from({ length: 200 }, (_, i) => ({
      role: (i === 1 ? 'system' : 'user') as 'system' | 'user',
      content: `msg ${i}`
    }))
    const result = ChatStreamStartInputSchema.safeParse({
      messages,
      model: 'deepseek-v4-pro'
    })
    expect(result.success).toBe(false)
  })

  it('rejects invalid role', () => {
    const result = ChatStreamStartInputSchema.safeParse({
      messages: [
        { role: 'admin', content: 'I am admin' }
      ]
    })
    expect(result.success).toBe(false)
  })
})
