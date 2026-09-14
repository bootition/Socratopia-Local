import { describe, it, expect, vi } from 'vitest'

import { createDeepSeekHttpAdapter } from '../../../src/main/llm/deepseek-http-adapter'
import type { DeepSeekCompletionData } from '../../../src/main/llm/types'

// ---------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------

const testApiKey = 'sk-test-key-12345'

const testMessages = [
  { role: 'user' as const, content: 'Hello' }
]

const stubCompletion: DeepSeekCompletionData = {
  id: 'chatcmpl-test-1',
  object: 'chat.completion',
  created: 1720000000,
  model: 'deepseek-v4-pro',
  choices: [
    {
      index: 0,
      message: { role: 'assistant', content: 'Hi!' },
      finish_reason: 'stop'
    }
  ],
  usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 }
}

// ---------------------------------------------------------------
// Mock fetch helpers
// ---------------------------------------------------------------

interface MockResponse {
  ok: boolean
  status: number
  json: ReturnType<typeof vi.fn>
  text: ReturnType<typeof vi.fn>
}

function mockResponse(
  status: number,
  body: unknown,
  ok?: boolean
): MockResponse {
  const isOk = ok ?? (status >= 200 && status < 300)
  const jsonFn = vi.fn().mockResolvedValue(body)
  const textFn = vi.fn().mockResolvedValue(
    typeof body === 'string' ? body : JSON.stringify(body)
  )
  return { ok: isOk, status, json: jsonFn, text: textFn }
}

// ---------------------------------------------------------------
// Tests
// ---------------------------------------------------------------

describe('createDeepSeekHttpAdapter', () => {
  // -----------------------------------------------------------
  // Success response
  // -----------------------------------------------------------

  describe('success (2xx)', () => {
    it('returns { ok: true, data } with parsed JSON body', async () => {
      const response = mockResponse(200, stubCompletion)
      const fetchMock = vi.fn().mockResolvedValue(response)
      const adapter = createDeepSeekHttpAdapter({
        fetchImpl: fetchMock as unknown as typeof fetch
      })

      const result = await adapter.chatCompletion({
        model: 'deepseek-v4-pro',
        messages: testMessages,
        apiKey: testApiKey
      })

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data).toEqual(stubCompletion)
      }
    })
  })

  // -----------------------------------------------------------
  // Request construction
  // -----------------------------------------------------------

  describe('request construction', () => {
    it('POSTs to the default endpoint with correct headers and body', async () => {
      const response = mockResponse(200, stubCompletion)
      const fetchMock = vi.fn().mockResolvedValue(response)
      const adapter = createDeepSeekHttpAdapter({
        fetchImpl: fetchMock as unknown as typeof fetch
      })

      await adapter.chatCompletion({
        model: 'deepseek-v4-pro',
        messages: testMessages,
        apiKey: testApiKey
      })

      expect(fetchMock).toHaveBeenCalledTimes(1)

      const callArgs = fetchMock.mock.calls[0] as [string, RequestInit]
      const url = callArgs[0]
      const init = callArgs[1]

      // Endpoint
      expect(url).toBe('https://api.deepseek.com/chat/completions')

      // Method
      expect(init?.method).toBe('POST')

      // Headers
      expect(init?.headers).toBeDefined()
      const headers = init?.headers as Record<string, string>
      expect(headers['Content-Type']).toBe('application/json')
      expect(headers['Authorization']).toBe(`Bearer ${testApiKey}`)

      // Body
      const bodyStr = init?.body as string
      const parsed = JSON.parse(bodyStr)
      expect(parsed.model).toBe('deepseek-v4-pro')
      expect(parsed.messages).toEqual(testMessages)
      expect(parsed.stream).toBe(false)
    })

    it('uses a custom endpoint when provided', async () => {
      const response = mockResponse(200, stubCompletion)
      const fetchMock = vi.fn().mockResolvedValue(response)
      const adapter = createDeepSeekHttpAdapter({
        endpoint: 'https://custom.api/deepseek',
        fetchImpl: fetchMock as unknown as typeof fetch
      })

      await adapter.chatCompletion({
        model: 'deepseek-v4-flash',
        messages: testMessages,
        apiKey: testApiKey
      })

      const callArgs = fetchMock.mock.calls[0] as [string, RequestInit]
      expect(callArgs[0]).toBe('https://custom.api/deepseek')
    })
  })

  // -----------------------------------------------------------
  // Error response (non-2xx) with parsed error body
  // -----------------------------------------------------------

  describe('error response (non-2xx)', () => {
    it('returns { ok: false, status, body } with parsed error JSON', async () => {
      const errorBody = {
        error: { message: 'Invalid API key', code: 'invalid_api_key' }
      }
      const response = mockResponse(401, errorBody)
      const fetchMock = vi.fn().mockResolvedValue(response)
      const adapter = createDeepSeekHttpAdapter({
        fetchImpl: fetchMock as unknown as typeof fetch
      })

      const result = await adapter.chatCompletion({
        model: 'deepseek-v4-pro',
        messages: testMessages,
        apiKey: testApiKey
      })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.status).toBe(401)
        expect(result.body).toEqual(errorBody)
      }
    })
  })

  // -----------------------------------------------------------
  // Non-JSON error body fallback
  // -----------------------------------------------------------

  describe('non-JSON error body', () => {
    it('returns { ok: false, status, body: undefined } when body is not JSON', async () => {
      const response = mockResponse(500, '<html>Server Error</html>')
      // Override json to simulate parse failure
      response.json = vi.fn().mockRejectedValue(new SyntaxError('Unexpected token'))
      const fetchMock = vi.fn().mockResolvedValue(response)
      const adapter = createDeepSeekHttpAdapter({
        fetchImpl: fetchMock as unknown as typeof fetch
      })

      const result = await adapter.chatCompletion({
        model: 'deepseek-v4-pro',
        messages: testMessages,
        apiKey: testApiKey
      })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.status).toBe(500)
        expect(result.body).toBeUndefined()
      }
    })
  })

  // -----------------------------------------------------------
  // Network failure sanitization
  // -----------------------------------------------------------

  describe('network failure', () => {
    it('returns { ok: false, status: 0 } when fetch throws', async () => {
      const fetchMock = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))
      const adapter = createDeepSeekHttpAdapter({
        fetchImpl: fetchMock as unknown as typeof fetch
      })

      const result = await adapter.chatCompletion({
        model: 'deepseek-v4-pro',
        messages: testMessages,
        apiKey: testApiKey
      })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.status).toBe(0)
        expect(result.body).toBeUndefined()
      }
    })
  })

  // -----------------------------------------------------------
  // API key safety
  // -----------------------------------------------------------

  describe('API key safety', () => {
    it('does not leak API key in error result body', async () => {
      const errorBody = { error: { message: 'Invalid API key' } }
      const response = mockResponse(401, errorBody)
      const fetchMock = vi.fn().mockResolvedValue(response)
      const adapter = createDeepSeekHttpAdapter({
        fetchImpl: fetchMock as unknown as typeof fetch
      })

      const result = await adapter.chatCompletion({
        model: 'deepseek-v4-pro',
        messages: testMessages,
        apiKey: testApiKey
      })

      const serialized = JSON.stringify(result)
      expect(serialized).not.toContain(testApiKey)
    })

    it('does not leak API key in network error result', async () => {
      const fetchMock = vi.fn().mockRejectedValue(new Error('Connection refused'))
      const adapter = createDeepSeekHttpAdapter({
        fetchImpl: fetchMock as unknown as typeof fetch
      })

      const result = await adapter.chatCompletion({
        model: 'deepseek-v4-pro',
        messages: testMessages,
        apiKey: testApiKey
      })

      // Result must not include the API key anywhere
      const serialized = JSON.stringify(result)
      expect(serialized).not.toContain(testApiKey)

      // Network error body should be undefined (no API key to leak)
      if (!result.ok) {
        expect(result.body).toBeUndefined()
      }
    })
  })

  // -----------------------------------------------------------
  // Endpoint validation
  // -----------------------------------------------------------

  describe('endpoint validation', () => {
    it('throws when endpoint uses http:// scheme', () => {
      expect(() =>
        createDeepSeekHttpAdapter({
          endpoint: 'http://api.deepseek.com/chat/completions'
        })
      ).toThrow('Endpoint must use HTTPS')
    })

    it('throws when endpoint uses http:// with a non-standard port', () => {
      expect(() =>
        createDeepSeekHttpAdapter({
          endpoint: 'http://localhost:8080/v1/chat/completions'
        })
      ).toThrow('Endpoint must use HTTPS')
    })

    it('throws before fetch is called (validation is at factory time)', () => {
      const fetchMock = vi.fn()
      const messageCheck = vi.fn()

      try {
        createDeepSeekHttpAdapter({
          endpoint: 'http://leaky-proxy.example.com/v1',
          fetchImpl: fetchMock as unknown as typeof fetch
        })
        messageCheck('no-throw')
      } catch (err) {
        messageCheck(err instanceof Error ? err.message : String(err))
      }

      // fetch must never have been called
      expect(fetchMock).not.toHaveBeenCalled()
      // The message must not leak the endpoint URL (which could be sensitive)
      expect(messageCheck).not.toHaveBeenCalledWith(
        expect.stringContaining('http://leaky-proxy.example.com')
      )
    })

    it('allows default endpoint (https://api.deepseek.com/...)', () => {
      expect(() => createDeepSeekHttpAdapter()).not.toThrow()
    })

    it('allows custom https:// endpoint', () => {
      expect(() =>
        createDeepSeekHttpAdapter({
          endpoint: 'https://custom-proxy.example.com/v1/chat/completions'
        })
      ).not.toThrow()
    })
  })

  // -----------------------------------------------------------
  // Default fetchImpl
  // -----------------------------------------------------------

  describe('default options', () => {
    it('creates adapter without fetchImpl option', () => {
      const adapter = createDeepSeekHttpAdapter()
      expect(adapter).toBeDefined()
      expect(adapter.chatCompletion).toBeInstanceOf(Function)
    })
  })
})

// ---------------------------------------------------------------
// Request extras: max_tokens + timeout
// ---------------------------------------------------------------

describe('createDeepSeekHttpAdapter — extras', () => {
  it('includes max_tokens when provided', async () => {
    const response = mockResponse(200, stubCompletion)
    const fetchMock = vi.fn().mockResolvedValue(response)
    const adapter = createDeepSeekHttpAdapter({
      fetchImpl: fetchMock as unknown as typeof fetch
    })

    await adapter.chatCompletion({
      model: 'deepseek-v4-pro',
      messages: testMessages,
      apiKey: testApiKey,
      maxTokens: 16
    })

    const init = fetchMock.mock.calls[0][1] as RequestInit
    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body.max_tokens).toBe(16)
  })

  it('resolves as a network failure when the request times out', async () => {
    const fetchMock = vi.fn().mockImplementation(
      (_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const error = new Error('aborted')
            error.name = 'AbortError'
            reject(error)
          })
        })
    )
    const adapter = createDeepSeekHttpAdapter({
      fetchImpl: fetchMock as unknown as typeof fetch,
      timeoutMs: 20
    })

    const result = await adapter.chatCompletion({
      model: 'deepseek-v4-pro',
      messages: testMessages,
      apiKey: testApiKey
    })

    expect(result).toEqual({ ok: false, status: 0 })
  })
})
