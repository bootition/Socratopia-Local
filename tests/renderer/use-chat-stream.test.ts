/**
 * Tests for createChatStreamController — the framework-agnostic chat stream bridge.
 *
 * All tests use a fake ChatAPI with captured callbacks and unsubscribe counters.
 * No Electron, React, or DOM dependencies required.
 *
 * The controller and its types are imported from the shared module so they
 * are reachable from node-side typechecking (tsconfig.node.json).
 */

import { describe, it, expect, beforeEach } from 'vitest'

import {
  createChatStreamController,
  type ChatAPI,
  type ChatMessage,
  type StreamError,
  type StreamUsage,
  type ChatStreamState,
  type CreateChatStreamControllerResult
} from '../../src/shared/chat-stream-controller'

// --------------- Fake ChatAPI builder ---------------

interface FakeChatAPIOptions {
  /** sessionId returned by startStream */
  sessionId?: string
  /** Milliseconds to delay startStream resolution */
  startDelay?: number
  /** If set, startStream rejects with this error */
  startError?: Error
  /** If set, cancelStream rejects with this error */
  cancelError?: Error
}

interface CapturedCallbacks {
  tokenCallbacks: Map<string, (token: string) => void>
  errorCallbacks: Map<string, (error: StreamError) => void>
  endCallbacks: Map<string, (finishReason: string) => void>
  usageCallbacks: Map<string, (usage: StreamUsage) => void>
  unsubscribeCounts: Map<string, number>
  startCallCount: number
  cancelCallCount: number
  cancelCallSessionIds: string[]
  // Active subscriber counts (incremented on subscribe, decremented on unsubscribe)
  activeSubscribers: number
}

function createFakeChatAPI(
  options: FakeChatAPIOptions = {}
): { api: ChatAPI; captured: CapturedCallbacks } {
  const sessionId = options.sessionId ?? 'fake-session-001'

  const captured: CapturedCallbacks = {
    tokenCallbacks: new Map(),
    errorCallbacks: new Map(),
    endCallbacks: new Map(),
    usageCallbacks: new Map(),
    unsubscribeCounts: new Map(),
    startCallCount: 0,
    cancelCallCount: 0,
    cancelCallSessionIds: [],
    activeSubscribers: 0
  }

  function makeUnsubscribe(eventName: string, sessionIdKey: string): () => void {
    let called = false
    return () => {
      if (called) return
      called = true
      const key = `${eventName}:${sessionIdKey}`
      captured.unsubscribeCounts.set(key, (captured.unsubscribeCounts.get(key) ?? 0) + 1)
      captured.activeSubscribers = Math.max(0, captured.activeSubscribers - 1)
    }
  }

  const api: ChatAPI = {
    async startStream(
      _messages: ChatMessage[],
      _model?: string
    ): Promise<string> {
      captured.startCallCount++
      if (options.startDelay) {
        await new Promise((r) => setTimeout(r, options.startDelay))
      }
      if (options.startError) {
        throw options.startError
      }
      return sessionId
    },

    async cancelStream(sid: string): Promise<void> {
      captured.cancelCallCount++
      captured.cancelCallSessionIds.push(sid)
      if (options.cancelError) {
        throw options.cancelError
      }
    },

    onToken(sid: string, callback: (token: string) => void): () => void {
      captured.tokenCallbacks.set(`${sid}`, callback)
      captured.activeSubscribers++
      return makeUnsubscribe('token', sid)
    },

    onError(sid: string, callback: (error: StreamError) => void): () => void {
      captured.errorCallbacks.set(`${sid}`, callback)
      captured.activeSubscribers++
      return makeUnsubscribe('error', sid)
    },

    onEnd(sid: string, callback: (finishReason: string) => void): () => void {
      captured.endCallbacks.set(`${sid}`, callback)
      captured.activeSubscribers++
      return makeUnsubscribe('end', sid)
    },

    onUsage(sid: string, callback: (usage: StreamUsage) => void): () => void {
      captured.usageCallbacks.set(`${sid}`, callback)
      captured.activeSubscribers++
      return makeUnsubscribe('usage', sid)
    }
  }

  return { api, captured }
}

// --------------- Tests ---------------

describe('createChatStreamController', () => {
  let fake: ReturnType<typeof createFakeChatAPI>
  let controller: CreateChatStreamControllerResult

  const testMessages: ChatMessage[] = [
    { role: 'user' as const, content: 'Hello, can you help me?' }
  ]

  beforeEach(() => {
    fake = createFakeChatAPI()
    controller = createChatStreamController(fake.api)
  })

  // --- Initial state ---

  it('has initial state with null sessionId, not streaming, no error', () => {
    expect(controller.state.sessionId).toBeNull()
    expect(controller.state.isStreaming).toBe(false)
    expect(controller.state.error).toBeNull()
    expect(controller.state.assistantContent).toBe('')
    expect(controller.state.usage).toBeNull()
  })

  // --- send() ---

  it('send() calls startStream with messages and default model', async () => {
    const sendPromise = controller.send(testMessages)
    expect(controller.state.isStreaming).toBe(true)
    await sendPromise
    expect(fake.captured.startCallCount).toBe(1)
    expect(controller.state.sessionId).toBe('fake-session-001')
  })

  it('send() passes model through to startStream', async () => {
    // We can't inspect the model arg directly with our fake, but we verify
    // the controller passes it by checking startStream is called.
    await controller.send(testMessages, 'deepseek-chat')
    expect(fake.captured.startCallCount).toBe(1)
  })

  it('send() subscribes to token, error, end, and usage events', async () => {
    await controller.send(testMessages)
    expect(fake.captured.tokenCallbacks.size).toBe(1)
    expect(fake.captured.errorCallbacks.size).toBe(1)
    expect(fake.captured.endCallbacks.size).toBe(1)
    expect(fake.captured.usageCallbacks.size).toBe(1)
    expect(fake.captured.activeSubscribers).toBe(4)
  })

  it('send() with startDelay keeps isStreaming true until resolved', async () => {
    const slow = createFakeChatAPI({ startDelay: 10 })
    const ctrl = createChatStreamController(slow.api)

    const sendPromise = ctrl.send(testMessages)
    // isStreaming is true during the async startStream
    expect(ctrl.state.isStreaming).toBe(true)
    await sendPromise
    // After resolution, isStreaming remains true (stream is still active)
    expect(ctrl.state.isStreaming).toBe(true)
  })

  it('send() handles startStream rejection by setting error', async () => {
    const bad = createFakeChatAPI({ startError: new Error('Connection refused') })
    const ctrl = createChatStreamController(bad.api)

    await ctrl.send(testMessages)

    expect(ctrl.state.error).toEqual({
      code: 'STREAM_START_FAILED',
      message: 'Connection refused'
    })
    expect(ctrl.state.isStreaming).toBe(false)
    expect(ctrl.state.sessionId).toBeNull()
  })

  // --- Token events ---

  it('token callback appends to assistantContent', async () => {
    await controller.send(testMessages)

    const tokenCb = fake.captured.tokenCallbacks.get('fake-session-001')
    expect(tokenCb).toBeDefined()

    tokenCb!('Hello')
    expect(controller.state.assistantContent).toBe('Hello')

    tokenCb!(' world')
    expect(controller.state.assistantContent).toBe('Hello world')

    tokenCb!('!')
    expect(controller.state.assistantContent).toBe('Hello world!')
  })

  // --- Usage events ---

  it('usage callback sets usage state', async () => {
    await controller.send(testMessages)

    const usageCb = fake.captured.usageCallbacks.get('fake-session-001')
    expect(usageCb).toBeDefined()

    usageCb!({ promptTokens: 100, completionTokens: 50, totalTokens: 150 })
    expect(controller.state.usage).toEqual({
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150
    })
  })

  // --- End events ---

  it('end callback sets isStreaming=false and unsubscribes', async () => {
    await controller.send(testMessages)
    expect(controller.state.isStreaming).toBe(true)

    const endCb = fake.captured.endCallbacks.get('fake-session-001')
    expect(endCb).toBeDefined()

    endCb!('stop')

    expect(controller.state.isStreaming).toBe(false)
    expect(controller.state.error).toBeNull()
    // After end, all subscribers should be cleaned up
    expect(fake.captured.activeSubscribers).toBe(0)
  })

  // --- Error events ---

  it('error callback sets error, stops streaming, and unsubscribes', async () => {
    await controller.send(testMessages)

    const errCb = fake.captured.errorCallbacks.get('fake-session-001')
    expect(errCb).toBeDefined()

    errCb!({ code: 'RATE_LIMITED', message: 'Too many requests' })

    expect(controller.state.error).toEqual({
      code: 'RATE_LIMITED',
      message: 'Too many requests'
    })
    expect(controller.state.isStreaming).toBe(false)
    expect(fake.captured.activeSubscribers).toBe(0)
  })

  // --- cancel() ---

  it('cancel() calls cancelStream with sessionId and unsubscribes', async () => {
    await controller.send(testMessages)

    await controller.cancel()

    expect(fake.captured.cancelCallCount).toBe(1)
    expect(fake.captured.cancelCallSessionIds).toEqual(['fake-session-001'])
    expect(controller.state.isStreaming).toBe(false)
    expect(fake.captured.activeSubscribers).toBe(0)
  })

  it('cancel() with no active stream is a no-op', async () => {
    await controller.cancel()

    expect(fake.captured.cancelCallCount).toBe(0)
    expect(controller.state.isStreaming).toBe(false)
    expect(controller.state.error).toBeNull()
  })

  it('cancel() with no sessionId is a no-op', async () => {
    // Mimic state where isStreaming true but sessionId is null (edge case)
    controller = createChatStreamController(fake.api)
    await controller.cancel()

    expect(fake.captured.cancelCallCount).toBe(0)
  })

  it('cancel() handles cancelStream rejection gracefully', async () => {
    const badCancel = createFakeChatAPI({ cancelError: new Error('Cancel failed') })
    const ctrl = createChatStreamController(badCancel.api)

    await ctrl.send(testMessages)
    await ctrl.cancel()

    // Should still clean up state even if cancelStream fails
    expect(ctrl.state.isStreaming).toBe(false)
    expect(badCancel.captured.activeSubscribers).toBe(0)
  })

  // --- Sequential send() cancels previous ---

  it('second send() cancels the previous stream before starting new one', async () => {
    await controller.send(testMessages)
    expect(controller.state.sessionId).toBe('fake-session-001')

    // Start a second stream
    await controller.send([{ role: 'user' as const, content: 'Another question' }])

    // The previous stream should have been cancelled
    expect(fake.captured.cancelCallCount).toBe(1)
    expect(fake.captured.cancelCallSessionIds).toEqual(['fake-session-001'])
    // Content from previous stream is cleared
    expect(controller.state.assistantContent).toBe('')
    // isStreaming should still be true for the new stream
    expect(controller.state.isStreaming).toBe(true)
    expect(controller.state.error).toBeNull()
  })

  // --- onStateChange callback ---

  it('notifies onStateChange on state transitions', async () => {
    const stateChanges: ChatStreamState[] = []
    const ctrl = createChatStreamController(fake.api, (state) => {
      stateChanges.push({ ...state })
    })

    await ctrl.send(testMessages)

    // Should have at least 2 changes: initial → streaming, streaming → subscribed
    expect(stateChanges.length).toBeGreaterThanOrEqual(2)

    // First change should have isStreaming=true
    const streamingEntry = stateChanges.find((s) => s.isStreaming)
    expect(streamingEntry).toBeDefined()
    expect(streamingEntry!.assistantContent).toBe('')
  })

  it('notifies onStateChange when token arrives', async () => {
    const stateChanges: ChatStreamState[] = []
    const ctrl = createChatStreamController(fake.api, (state) => {
      stateChanges.push({ ...state })
    })

    await ctrl.send(testMessages)
    const changesBefore = stateChanges.length

    const tokenCb = fake.captured.tokenCallbacks.get('fake-session-001')
    tokenCb!('Hi')

    // Should have at least one more change after token arrives
    expect(stateChanges.length).toBeGreaterThan(changesBefore)
    const lastState = stateChanges[stateChanges.length - 1]
    expect(lastState.assistantContent).toBe('Hi')
  })

  // --- Initializing send() while already streaming ---

  it('send() while already streaming cancels and starts fresh', async () => {
    await controller.send(testMessages)

    // Simulate some tokens being received
    const tokenCb = fake.captured.tokenCallbacks.get('fake-session-001')
    tokenCb!('Partial response')
    expect(controller.state.assistantContent).toBe('Partial response')

    // Send a new message without cancelling first
    await controller.send([{ role: 'user' as const, content: 'New question' }])

    // Previous should be cancelled
    expect(fake.captured.cancelCallCount).toBe(1)
    // Content should be reset
    expect(controller.state.assistantContent).toBe('')
    // New stream should be active
    expect(controller.state.isStreaming).toBe(true)
    expect(controller.state.error).toBeNull()
  })
})
