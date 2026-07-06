import { describe, it, expect } from 'vitest'

import type { DeepSeekApiAdapter, DeepSeekApiResult } from '../../../src/main/llm/types'
import { DEEPSEEK_V4_PRO, DEEPSEEK_V4_FLASH } from '../../../src/main/llm/types'
import { DeepSeekClient } from '../../../src/main/llm/deepseek-client'
import { AppError } from '../../../src/main/llm/errors'

// ---------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------

function createMockAdapter(
  response: DeepSeekApiResult
): DeepSeekApiAdapter {
  return {
    chatCompletion: () => Promise.resolve(response)
  }
}

const stubCompletion = {
  id: 'chatcmpl-test-1',
  object: 'chat.completion',
  created: 1720000000,
  model: 'deepseek-v4-pro',
  choices: [
    {
      index: 0,
      message: { role: 'assistant', content: 'Hello! How can I help?' },
      finish_reason: 'stop'
    }
  ],
  usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
}

const testMessages = [
  { role: 'user' as const, content: 'Hi' }
]

const testApiKey = 'sk-test-key-12345'

// ---------------------------------------------------------------
// Constants
// ---------------------------------------------------------------

describe('DeepSeekModel constants', () => {
  it('DEEPSEEK_V4_PRO is "deepseek-v4-pro"', () => {
    expect(DEEPSEEK_V4_PRO).toBe('deepseek-v4-pro')
  })

  it('DEEPSEEK_V4_FLASH is "deepseek-v4-flash"', () => {
    expect(DEEPSEEK_V4_FLASH).toBe('deepseek-v4-flash')
  })
})

// ---------------------------------------------------------------
// DeepSeekClient — successful chat
// ---------------------------------------------------------------

describe('DeepSeekClient.chat', () => {
  it('returns assistant message content for a valid completion', async () => {
    const adapter = createMockAdapter({ ok: true, data: stubCompletion })
    const client = new DeepSeekClient(testApiKey, adapter)

    const response = await client.chat(testMessages)

    expect(response.content).toBe('Hello! How can I help?')
    expect(response.model).toBe('deepseek-v4-pro')
    expect(response.finishReason).toBe('stop')
    expect(response.usage).toEqual({
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15
    })
  })

  it('uses DEEPSEEK_V4_PRO as the default model', async () => {
    let capturedModel = ''
    const adapter: DeepSeekApiAdapter = {
      chatCompletion: async (params) => {
        capturedModel = params.model
        return { ok: true, data: stubCompletion }
      }
    }

    const client = new DeepSeekClient(testApiKey, adapter)
    await client.chat(testMessages)

    expect(capturedModel).toBe('deepseek-v4-pro')
  })

  it('allows overriding the model via options', async () => {
    let capturedModel = ''
    const adapter: DeepSeekApiAdapter = {
      chatCompletion: async (params) => {
        capturedModel = params.model
        return { ok: true, data: stubCompletion }
      }
    }

    const client = new DeepSeekClient(testApiKey, adapter)
    await client.chat(testMessages, { model: DEEPSEEK_V4_FLASH })

    expect(capturedModel).toBe('deepseek-v4-flash')
  })

  it('accepts a custom default model in constructor', async () => {
    let capturedModel = ''
    const adapter: DeepSeekApiAdapter = {
      chatCompletion: async (params) => {
        capturedModel = params.model
        return { ok: true, data: stubCompletion }
      }
    }

    const client = new DeepSeekClient(testApiKey, adapter, DEEPSEEK_V4_FLASH)
    await client.chat(testMessages)

    expect(capturedModel).toBe('deepseek-v4-flash')
  })

  it('passes system messages to the adapter', async () => {
    let capturedMessages: Array<{ role: string; content: string }> = []
    const adapter: DeepSeekApiAdapter = {
      chatCompletion: async (params) => {
        capturedMessages = params.messages
        return { ok: true, data: stubCompletion }
      }
    }

    const client = new DeepSeekClient(testApiKey, adapter)
    await client.chat([
      { role: 'system', content: 'You are a helpful tutor.' },
      { role: 'user', content: 'Hello' }
    ])

    expect(capturedMessages).toHaveLength(2)
    expect(capturedMessages[0]).toEqual({ role: 'system', content: 'You are a helpful tutor.' })
    expect(capturedMessages[1]).toEqual({ role: 'user', content: 'Hello' })
  })
})

// ---------------------------------------------------------------
// Missing API key
// ---------------------------------------------------------------

describe('DeepSeekClient — missing API key', () => {
  it('throws when apiKey is empty string', () => {
    const adapter = createMockAdapter({ ok: true, data: stubCompletion })

    expect(() => new DeepSeekClient('', adapter)).toThrow(AppError)
  })

  it('throws AppError with code MISSING_API_KEY for empty key', () => {
    const adapter = createMockAdapter({ ok: true, data: stubCompletion })

    expect(() => new DeepSeekClient('', adapter)).toThrow(
      expect.objectContaining({ code: 'MISSING_API_KEY' })
    )
  })

  it('throws when apiKey is whitespace only', () => {
    const adapter = createMockAdapter({ ok: true, data: stubCompletion })

    expect(() => new DeepSeekClient('   ', adapter)).toThrow(AppError)
  })
})

// ---------------------------------------------------------------
// Error mapping: 400 / Invalid request
// ---------------------------------------------------------------

describe('Error mapping', () => {
  it('maps HTTP 400 to AppError with code INVALID_REQUEST', async () => {
    const adapter = createMockAdapter({
      ok: false,
      status: 400,
      body: { error: { message: 'Invalid request body' } }
    })

    const client = new DeepSeekClient(testApiKey, adapter)

    await expect(client.chat(testMessages)).rejects.toThrow(AppError)
    await expect(client.chat(testMessages)).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
      httpStatus: 400,
      retryable: false
    })
  })

  it('maps HTTP 401 to AppError with code UNAUTHORIZED', async () => {
    const adapter = createMockAdapter({
      ok: false,
      status: 401,
      body: { error: { message: 'Authentication failed' } }
    })

    const client = new DeepSeekClient(testApiKey, adapter)

    await expect(client.chat(testMessages)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      httpStatus: 401,
      retryable: false
    })
  })

  it('maps HTTP 402 to AppError with code INSUFFICIENT_BALANCE', async () => {
    const adapter = createMockAdapter({
      ok: false,
      status: 402,
      body: { error: { message: 'Insufficient balance' } }
    })

    const client = new DeepSeekClient(testApiKey, adapter)

    await expect(client.chat(testMessages)).rejects.toMatchObject({
      code: 'INSUFFICIENT_BALANCE',
      httpStatus: 402,
      retryable: false
    })
  })

  it('maps HTTP 422 to AppError with code INVALID_PARAMETER', async () => {
    const adapter = createMockAdapter({
      ok: false,
      status: 422,
      body: { error: { message: 'Invalid parameter: model' } }
    })

    const client = new DeepSeekClient(testApiKey, adapter)

    await expect(client.chat(testMessages)).rejects.toMatchObject({
      code: 'INVALID_PARAMETER',
      httpStatus: 422,
      retryable: false
    })
  })

  it('maps HTTP 429 to AppError with code RATE_LIMITED (retryable)', async () => {
    const adapter = createMockAdapter({
      ok: false,
      status: 429,
      body: { error: { message: 'Rate limit exceeded' } }
    })

    const client = new DeepSeekClient(testApiKey, adapter)

    await expect(client.chat(testMessages)).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      httpStatus: 429,
      retryable: true
    })
  })

  it('maps HTTP 500 to AppError with code SERVER_ERROR (retryable)', async () => {
    const adapter = createMockAdapter({
      ok: false,
      status: 500,
      body: { error: { message: 'Internal server error' } }
    })

    const client = new DeepSeekClient(testApiKey, adapter)

    await expect(client.chat(testMessages)).rejects.toMatchObject({
      code: 'SERVER_ERROR',
      httpStatus: 500,
      retryable: true
    })
  })

  it('maps HTTP 503 to AppError with code SERVICE_UNAVAILABLE (retryable)', async () => {
    const adapter = createMockAdapter({
      ok: false,
      status: 503,
      body: { error: { message: 'Service overloaded' } }
    })

    const client = new DeepSeekClient(testApiKey, adapter)

    await expect(client.chat(testMessages)).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
      httpStatus: 503,
      retryable: true
    })
  })
})

// ---------------------------------------------------------------
// AppError class
// ---------------------------------------------------------------

describe('AppError', () => {
  it('extends Error', () => {
    const err = new AppError('TEST_CODE', 400, 'Test message')
    expect(err).toBeInstanceOf(Error)
  })

  it('has code, httpStatus, message, and retryable', () => {
    const err = new AppError('RATE_LIMITED', 429, 'Too many requests', true)
    expect(err.code).toBe('RATE_LIMITED')
    expect(err.httpStatus).toBe(429)
    expect(err.message).toBe('Too many requests')
    expect(err.retryable).toBe(true)
  })

  it('defaults retryable to false', () => {
    const err = new AppError('UNAUTHORIZED', 401, 'Bad key')
    expect(err.retryable).toBe(false)
  })
})
