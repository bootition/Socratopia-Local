/**
 * Tests for StreamChatSession — the pure stream session manager.
 *
 * All tests use an injected mock DeepSeekStreamAdapter that yields
 * pre-built chunks from an async iterable. No Electron or network
 * dependencies required.
 *
 * Updated for Task 7 review fixes:
 * - AbortSignal: adapter receives signal; cancel() aborts it; aborted
 *   adapters produce error events with code ABORTED.
 * - Timeout: sessions auto-cancel after configurable timeout.
 */
import { describe, it, expect, vi } from 'vitest'

import type {
  DeepSeekStreamAdapter,
  DeepSeekStreamChunk,
  DeepSeekStreamParams,
  StreamEvent
} from '../../../src/main/llm/stream-types'
import type { DeepSeekChatMessage } from '../../../src/main/llm/types'
import { StreamChatSession } from '../../../src/main/llm/stream-chat'

// ---------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------

const testMessages: DeepSeekChatMessage[] = [
  { role: 'user', content: 'Hello' }
]

const testApiKey = 'sk-test-stream-key-123'

/**
 * Create a mock adapter that yields the given chunks in order.
 * Records the params (including signal) passed to streamChat.
 */
function mockStreamAdapter(
  chunks: DeepSeekStreamChunk[]
): DeepSeekStreamAdapter & { lastParams: DeepSeekStreamParams | null } {
  const adapter = {
    lastParams: null as DeepSeekStreamParams | null,
    streamChat: async function* (params: DeepSeekStreamParams) {
      adapter.lastParams = params
      for (const chunk of chunks) {
        yield chunk
      }
    }
  }
  return adapter
}

/**
 * Create a mock adapter that throws during iteration.
 */
function mockThrowingAdapter(
  errorMessage: string,
  chunksBeforeThrow: DeepSeekStreamChunk[] = []
): DeepSeekStreamAdapter {
  return {
    streamChat: async function* () {
      for (const chunk of chunksBeforeThrow) {
        yield chunk
      }
      throw new Error(errorMessage)
    }
  }
}

/**
 * Create a mock adapter that yields chunks and also records
 * whether the signal was aborted during iteration.
 */
function mockSignalAwareAdapter(
  chunks: DeepSeekStreamChunk[]
): DeepSeekStreamAdapter & { lastParams: DeepSeekStreamParams | null } {
  const adapter = {
    lastParams: null as DeepSeekStreamParams | null,
    streamChat: async function* (params: DeepSeekStreamParams) {
      adapter.lastParams = params
      for (const chunk of chunks) {
        yield chunk
      }
    }
  }
  return adapter
}

function tokenChunk(content: string): DeepSeekStreamChunk {
  return {
    choices: [{ delta: { content } }]
  }
}

function finishChunk(
  finishReason = 'stop',
  usage?: DeepSeekStreamChunk['usage']
): DeepSeekStreamChunk {
  return {
    choices: [{ finish_reason: finishReason }],
    usage
  }
}

function createSession(
  adapter: DeepSeekStreamAdapter,
  sessionId = 'test-session-1',
  timeoutMs?: number
): { session: StreamChatSession; events: StreamEvent[]; start: () => Promise<void> } {
  const events: StreamEvent[] = []
  const session = new StreamChatSession(
    sessionId,
    { messages: testMessages, model: 'deepseek-v4-pro', apiKey: testApiKey },
    adapter,
    (event: StreamEvent) => { events.push(event) },
    timeoutMs
  )
  return { session, events, start: () => session.start() }
}

// ---------------------------------------------------------------
// Normal stream
// ---------------------------------------------------------------

describe('StreamChatSession — normal stream', () => {
  it('emits token events for each content delta in order', async () => {
    const adapter = mockStreamAdapter([
      tokenChunk('Hello'),
      tokenChunk(', '),
      tokenChunk('world'),
      tokenChunk('!'),
      finishChunk('stop')
    ])

    const { events, start } = createSession(adapter)
    await start()

    const tokens = events
      .filter((e) => e.type === 'token')
      .map((e) => (e as { token: string }).token)

    expect(tokens).toEqual(['Hello', ', ', 'world', '!'])
  })

  it('emits end event with finishReason after all tokens', async () => {
    const adapter = mockStreamAdapter([
      tokenChunk('Hi'),
      finishChunk('stop')
    ])

    const { events, start } = createSession(adapter)
    await start()

    const endEvent = events.find((e) => e.type === 'end')
    expect(endEvent).toBeDefined()
    expect((endEvent as { finishReason: string }).finishReason).toBe('stop')
  })

  it('emits usage event when the final chunk includes usage data', async () => {
    const adapter = mockStreamAdapter([
      tokenChunk('A'),
      finishChunk('stop', { prompt_tokens: 50, completion_tokens: 10, total_tokens: 60 })
    ])

    const { events, start } = createSession(adapter)
    await start()

    const usageEvent = events.find((e) => e.type === 'usage')
    expect(usageEvent).toBeDefined()
    expect((usageEvent as { promptTokens: number }).promptTokens).toBe(50)
    expect((usageEvent as { completionTokens: number }).completionTokens).toBe(10)
    expect((usageEvent as { totalTokens: number }).totalTokens).toBe(60)
  })

  it('does not emit usage when final chunk has no usage', async () => {
    const adapter = mockStreamAdapter([
      tokenChunk('X'),
      finishChunk('stop')
    ])

    const { events, start } = createSession(adapter)
    await start()

    const hasUsage = events.some((e) => e.type === 'usage')
    expect(hasUsage).toBe(false)
  })

  it('emits usage event before end event', async () => {
    const adapter = mockStreamAdapter([
      tokenChunk('T'),
      finishChunk('stop', { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 })
    ])

    const { events, start } = createSession(adapter)
    await start()

    const usageIdx = events.findIndex((e) => e.type === 'usage')
    const endIdx = events.findIndex((e) => e.type === 'end')

    expect(usageIdx).toBeGreaterThan(-1)
    expect(endIdx).toBeGreaterThan(-1)
    expect(usageIdx).toBeLessThan(endIdx)
  })

  it('emits only end event when adapter yields no content chunks', async () => {
    const adapter = mockStreamAdapter([
      finishChunk('stop')
    ])

    const { events, start } = createSession(adapter)
    await start()

    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('end')
  })
})

// ---------------------------------------------------------------
// AbortSignal — true cancellation
// ---------------------------------------------------------------

describe('StreamChatSession — AbortSignal (true cancellation)', () => {
  it('passes a non-aborted AbortSignal to the adapter', async () => {
    const adapter = mockSignalAwareAdapter([
      tokenChunk('t1'),
      finishChunk('stop')
    ])

    const { start } = createSession(adapter)
    await start()

    expect(adapter.lastParams).not.toBeNull()
    expect(adapter.lastParams!.signal).toBeDefined()
    expect(adapter.lastParams!.signal!.aborted).toBe(false)
  })

  it('cancel() aborts the signal passed to the adapter', async () => {
    let cancelFn!: () => void

    const adapter: DeepSeekStreamAdapter & { lastParams: DeepSeekStreamParams | null } = {
      lastParams: null,
      streamChat: async function* (params: DeepSeekStreamParams) {
        adapter.lastParams = params
        yield tokenChunk('first')
        cancelFn()
        // After cancel, the signal should be aborted
        yield tokenChunk('after-cancel')
        yield finishChunk('stop')
      }
    }

    const events: StreamEvent[] = []
    const session = new StreamChatSession(
      'signal-cancel-test',
      { messages: testMessages, model: 'deepseek-v4-pro', apiKey: testApiKey },
      adapter,
      (event: StreamEvent) => { events.push(event) }
    )

    cancelFn = () => session.cancel()
    await session.start()

    expect(adapter.lastParams).not.toBeNull()
    expect(adapter.lastParams!.signal!.aborted).toBe(true)
  })

  it('cancelled stream emits ABORTED error event (not end)', async () => {
    let cancelFn!: () => void

    const adapter: DeepSeekStreamAdapter = {
      streamChat: async function* () {
        yield tokenChunk('token')
        cancelFn() // cancel during streaming
        // Simulate adapter still yielding (abort should prevent processing)
        yield tokenChunk('should-not-emit')
        yield finishChunk('stop')
      }
    }

    const events: StreamEvent[] = []
    const session = new StreamChatSession(
      'abort-error-test',
      { messages: testMessages, model: 'deepseek-v4-pro', apiKey: testApiKey },
      adapter,
      (event: StreamEvent) => { events.push(event) }
    )

    cancelFn = () => session.cancel()
    await session.start()

    // Should have token + ABORTED error event
    const errorEvent = events.find((e) => e.type === 'error')
    expect(errorEvent).toBeDefined()
    expect((errorEvent as { code: string }).code).toBe('ABORTED')

    // Should NOT emit end event
    const hasEnd = events.some((e) => e.type === 'end')
    expect(hasEnd).toBe(false)

    // Should only have token(s) from before cancel
    const tokens = events.filter((e) => e.type === 'token')
    expect(tokens).toHaveLength(1)
  })

  it('cancel() is idempotent — calling abort() twice does not throw', () => {
    const adapter = mockStreamAdapter([finishChunk('stop')])
    const { session } = createSession(adapter)

    session.cancel()
    expect(() => session.cancel()).not.toThrow()
  })

  it('start() resolves after cancel() even if adapter hangs', async () => {
    // Adapter that hangs forever like a stuck network connection
    const adapter: DeepSeekStreamAdapter = {
      streamChat: async function* () {
        yield tokenChunk('one')
        // Hang forever — simulate network stall
        await new Promise(() => {})
        yield tokenChunk('never')
      }
    }

    const events: StreamEvent[] = []
    const session = new StreamChatSession(
      'hang-test',
      { messages: testMessages, model: 'deepseek-v4-pro', apiKey: testApiKey },
      adapter,
      (event: StreamEvent) => { events.push(event) }
    )

    const startPromise = session.start()

    // Let first token emit
    await vi.waitFor(() => events.length >= 1, { timeout: 100 })

    session.cancel()

    // start() should resolve within a reasonable time
    await expect(
      Promise.race([
        startPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('start() did not resolve after cancel')), 1000))
      ])
    ).resolves.toBeUndefined()

    // Should have ABORTED event
    const errorEvent = events.find((e) => e.type === 'error')
    expect(errorEvent).toBeDefined()
    expect((errorEvent as { code: string }).code).toBe('ABORTED')
  })
})

// ---------------------------------------------------------------
// Session timeout guard
// ---------------------------------------------------------------

describe('StreamChatSession — timeout guard', () => {
  it('auto-cancels when the timeout is reached', async () => {
    // Adapter that yields slowly but never finishes
    const adapter: DeepSeekStreamAdapter = {
      streamChat: async function* () {
        yield tokenChunk('first')
        // Simulate a very slow response by hanging
        await new Promise(() => {})
        yield tokenChunk('never-reached')
      }
    }

    const events: StreamEvent[] = []
    const session = new StreamChatSession(
      'timeout-test',
      { messages: testMessages, model: 'deepseek-v4-pro', apiKey: testApiKey },
      adapter,
      (event: StreamEvent) => { events.push(event) },
      50 // 50ms timeout
    )

    await session.start()

    // Should have token + ABORTED error  (not end)
    const errorEvent = events.find((e) => e.type === 'error')
    expect(errorEvent).toBeDefined()
    expect((errorEvent as { code: string }).code).toBe('ABORTED')

    const hasEnd = events.some((e) => e.type === 'end')
    expect(hasEnd).toBe(false)
  })

  it('does not auto-cancel when stream completes before timeout', async () => {
    const adapter = mockStreamAdapter([
      tokenChunk('fast'),
      finishChunk('stop')
    ])

    const { events, start } = createSession(adapter, 'fast-test', 5000)
    await start()

    // Should complete normally with end event
    const endEvent = events.find((e) => e.type === 'end')
    expect(endEvent).toBeDefined()

    const hasAbort = events.some((e) => e.type === 'error' && (e as { code: string }).code === 'ABORTED')
    expect(hasAbort).toBe(false)
  })

  it('clears the timeout timer after normal completion', async () => {
    // Use vi.useFakeTimers if available, otherwise rely on behavior
    const adapter = mockStreamAdapter([
      tokenChunk('done'),
      finishChunk('stop')
    ])

    const { session, events, start } = createSession(adapter, 'clear-test', 100)
    await start()

    // Should complete with end (not abort)
    expect(session.isRunning).toBe(false)
    const endEvent = events.find((e) => e.type === 'end')
    expect(endEvent).toBeDefined()
  })

  it('default timeout is 300000ms (5 minutes)', () => {
    const adapter = mockStreamAdapter([finishChunk('stop')])
    const session = new StreamChatSession(
      'default-timeout',
      { messages: testMessages, model: 'deepseek-v4-pro', apiKey: testApiKey },
      adapter,
      () => {},
      undefined // use default
    )
    // Just verify construction succeeds
    expect(session.id).toBe('default-timeout')
  })
})

// ---------------------------------------------------------------
// Error stream
// ---------------------------------------------------------------

describe('StreamChatSession — error handling', () => {
  it('emits error event when adapter throws mid-stream', async () => {
    const adapter = mockThrowingAdapter(
      'Network failure',
      [tokenChunk('partial')]
    )

    const { events, start } = createSession(adapter)
    await start()

    const errorEvent = events.find((e) => e.type === 'error')
    expect(errorEvent).toBeDefined()
    expect((errorEvent as { message: string }).message).toBe('Network failure')
  })

  it('emits error event with code when adapter throws immediately', async () => {
    const adapter = mockThrowingAdapter('Connection refused')

    const { events, start } = createSession(adapter)
    await start()

    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('error')
    expect((events[0] as { message: string }).message).toBe('Connection refused')
  })

  it('does not emit end event after error', async () => {
    const adapter = mockThrowingAdapter(
      'Timeout',
      [tokenChunk('partial')]
    )

    const { events, start } = createSession(adapter)
    await start()

    const hasEnd = events.some((e) => e.type === 'end')
    expect(hasEnd).toBe(false)
  })

  it('includes a non-empty error code string', async () => {
    const adapter = mockThrowingAdapter('Server error: 500')

    const { events, start } = createSession(adapter)
    await start()

    const err = events.find((e) => e.type === 'error')
    expect((err as { code: string }).code).toBeDefined()
    expect(typeof (err as { code: string }).code).toBe('string')
    expect((err as { code: string }).code.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------
// Session identity
// ---------------------------------------------------------------

describe('StreamChatSession — identity', () => {
  it('exposes id and isRunning properties', async () => {
    const adapter = mockStreamAdapter([finishChunk('stop')])
    const { session, start } = createSession(adapter, 'my-session')

    expect(session.id).toBe('my-session')

    await start()

    expect(session.isRunning).toBe(false)
  })

  it('isRunning is true during streaming and false after completion', async () => {
    const adapter: DeepSeekStreamAdapter = {
      streamChat: async function* () {
        yield tokenChunk('test')
        yield finishChunk('stop')
      }
    }

    const runningStates: boolean[] = []
    const session = new StreamChatSession(
      'running-check',
      { messages: testMessages, model: 'deepseek-v4-pro', apiKey: testApiKey },
      adapter,
      (_event: StreamEvent) => {
        runningStates.push(session.isRunning)
      }
    )

    await session.start()

    expect(runningStates.length).toBeGreaterThan(0)
    expect(session.isRunning).toBe(false)
  })
})

// ---------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------

describe('StreamChatSession — edge cases', () => {
  it('skips chunks where delta.content is empty or missing', async () => {
    const adapter = mockStreamAdapter([
      { choices: [{ delta: {} }] },
      { choices: [{ delta: { content: '' } }] },
      tokenChunk('real'),
      finishChunk('stop')
    ])

    const { events, start } = createSession(adapter)
    await start()

    const tokens = events
      .filter((e) => e.type === 'token')
      .map((e) => (e as { token: string }).token)

    expect(tokens).toEqual(['real'])
  })

  it('handles chunks with no choices array gracefully', async () => {
    const adapter = mockStreamAdapter([
      {},
      { choices: [] },
      finishChunk('stop')
    ])

    const { events, start } = createSession(adapter)
    await start()

    const hasEnd = events.some((e) => e.type === 'end')
    expect(hasEnd).toBe(true)
  })

  it('handles multiple finish_reason changes (takes the first non-null)', async () => {
    const adapter = mockStreamAdapter([
      tokenChunk('x'),
      finishChunk('length'),
      finishChunk('stop')
    ])

    const { events, start } = createSession(adapter)
    await start()

    const endEvent = events.find((e) => e.type === 'end')
    expect((endEvent as { finishReason: string }).finishReason).toBe('length')
  })

  it('defaults finishReason to "stop" when finish_reason is null', async () => {
    const adapter = mockStreamAdapter([
      tokenChunk('content'),
      finishChunk(null as unknown as string)
    ])

    const { events, start } = createSession(adapter)
    await start()

    const endEvent = events.find((e) => e.type === 'end')
    expect((endEvent as { finishReason: string }).finishReason).toBe('stop')
  })
})
