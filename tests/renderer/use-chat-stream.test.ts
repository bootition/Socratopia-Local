/**
 * Tests for createChatStreamController — the framework-agnostic chat stream bridge.
 *
 * All tests use a fake ChatAPI with captured callbacks and unsubscribe counters.
 * No Electron, React, or DOM dependencies required.
 *
 * `send()` resolves only when the stream ends, errors, or is cancelled, so
 * every test that awaits it must first drive the fake stream to completion.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

import {
  createChatStreamController,
  type ChatAPI,
  type ChatRequest,
  type StreamError,
  type StreamUsage,
  type ChatStreamState,
  type ChatStartResult,
  type CreateChatStreamControllerResult
} from '../../src/shared/chat-stream-controller'
import type { MessageSource } from '../../src/shared/schemas/message'

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
  /** Grounding sources returned by startStream */
  sources?: MessageSource[]
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
  /** Most recent request passed to startStream */
  lastRequest: ChatRequest | null
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
    lastRequest: null,
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
    async startStream(request: ChatRequest): Promise<ChatStartResult> {
      captured.startCallCount++
      captured.lastRequest = request
      if (options.startDelay) {
        await new Promise((r) => setTimeout(r, options.startDelay))
      }
      if (options.startError) {
        throw options.startError
      }
      return { sessionId, sources: options.sources ?? [] }
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

/** Wait until the controller has subscribed to all four event kinds. */
async function waitForSubscriptions(
  captured: CapturedCallbacks,
  sessionId = 'fake-session-001'
): Promise<void> {
  await vi.waitFor(() => {
    expect(captured.endCallbacks.get(sessionId)).toBeDefined()
  })
}

/** Drive the fake stream to a normal end. */
async function endStream(
  captured: CapturedCallbacks,
  sessionId = 'fake-session-001',
  finishReason = 'stop'
): Promise<void> {
  await waitForSubscriptions(captured, sessionId)
  captured.endCallbacks.get(sessionId)!(finishReason)
}

// --------------- Tests ---------------

describe('createChatStreamController', () => {
  let fake: ReturnType<typeof createFakeChatAPI>
  let controller: CreateChatStreamControllerResult

  const testRequest: ChatRequest = {
    companionId: 'comp_alice',
    textbookId: null,
    conversationId: null,
    userMessage: 'Hello, can you help me?'
  }

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

  it('send() calls startStream with the classroom request', async () => {
    const sendPromise = controller.send(testRequest)
    expect(controller.state.isStreaming).toBe(true)

    await endStream(fake.captured)
    const result = await sendPromise

    expect(fake.captured.startCallCount).toBe(1)
    expect(fake.captured.lastRequest).toEqual(testRequest)
    expect(controller.state.sessionId).toBe('fake-session-001')
    expect(result.error).toBeNull()
  })

  it('send() passes model and reasoning effort through to startStream', async () => {
    const sendPromise = controller.send({
      ...testRequest,
      model: 'deepseek-v4-flash',
      reasoningEffort: 'low'
    })
    await endStream(fake.captured)
    await sendPromise

    expect(fake.captured.startCallCount).toBe(1)
    expect(fake.captured.lastRequest!.model).toBe('deepseek-v4-flash')
    expect(fake.captured.lastRequest!.reasoningEffort).toBe('low')
  })

  it('send() resolves with grounding sources returned by startStream', async () => {
    const source = {
      segmentId: 'seg_2',
      label: '第一章 · 第 2 段',
      text: '物体保持静止或匀速直线运动。'
    }
    const fakeWithSources = createFakeChatAPI({ sources: [source] })
    const ctrl = createChatStreamController(fakeWithSources.api)

    const sendPromise = ctrl.send(testRequest)
    await endStream(fakeWithSources.captured)
    const result = await sendPromise

    expect(result.sources).toEqual([source])
  })

  it('send() subscribes to token, error, end, and usage events', async () => {
    const sendPromise = controller.send(testRequest)
    await waitForSubscriptions(fake.captured)

    expect(fake.captured.tokenCallbacks.size).toBe(1)
    expect(fake.captured.errorCallbacks.size).toBe(1)
    expect(fake.captured.endCallbacks.size).toBe(1)
    expect(fake.captured.usageCallbacks.size).toBe(1)
    expect(fake.captured.activeSubscribers).toBe(4)

    await endStream(fake.captured)
    await sendPromise
  })

  it('send() with startDelay keeps isStreaming true until resolved', async () => {
    const slow = createFakeChatAPI({ startDelay: 10 })
    const ctrl = createChatStreamController(slow.api)

    const sendPromise = ctrl.send(testRequest)
    // isStreaming is true during the async startStream
    expect(ctrl.state.isStreaming).toBe(true)

    await endStream(slow.captured)
    await sendPromise

    // After the stream ends it is no longer streaming
    expect(ctrl.state.isStreaming).toBe(false)
  })

  it('send() handles startStream rejection by setting error', async () => {
    const bad = createFakeChatAPI({ startError: new Error('Connection refused') })
    const ctrl = createChatStreamController(bad.api)

    const result = await ctrl.send(testRequest)

    expect(result.error).toEqual({
      code: 'STREAM_START_FAILED',
      message: 'Connection refused'
    })
    expect(ctrl.state.error).toEqual({
      code: 'STREAM_START_FAILED',
      message: 'Connection refused'
    })
    expect(ctrl.state.isStreaming).toBe(false)
    expect(ctrl.state.sessionId).toBeNull()
  })

  // --- Token events ---

  it('token callback appends to assistantContent and resolves send() with it', async () => {
    const sendPromise = controller.send(testRequest)
    await waitForSubscriptions(fake.captured)

    const tokenCb = fake.captured.tokenCallbacks.get('fake-session-001')
    expect(tokenCb).toBeDefined()

    tokenCb!('Hello')
    expect(controller.state.assistantContent).toBe('Hello')

    tokenCb!(' world')
    expect(controller.state.assistantContent).toBe('Hello world')

    tokenCb!('!')
    expect(controller.state.assistantContent).toBe('Hello world!')

    await endStream(fake.captured)
    const result = await sendPromise
    expect(result.content).toBe('Hello world!')
    expect(result.error).toBeNull()
    expect(result.cancelled).toBe(false)
  })

  // --- Usage events ---

  it('usage callback sets usage state and end result carries it', async () => {
    const sendPromise = controller.send(testRequest)
    await waitForSubscriptions(fake.captured)

    const usageCb = fake.captured.usageCallbacks.get('fake-session-001')
    expect(usageCb).toBeDefined()

    usageCb!({ promptTokens: 100, completionTokens: 50, totalTokens: 150 })
    expect(controller.state.usage).toEqual({
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150
    })

    await endStream(fake.captured)
    const result = await sendPromise
    expect(result.usage).toEqual({
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150
    })
  })

  // --- End events ---

  it('end callback sets isStreaming=false and unsubscribes', async () => {
    const sendPromise = controller.send(testRequest)
    await waitForSubscriptions(fake.captured)
    expect(controller.state.isStreaming).toBe(true)

    await endStream(fake.captured)

    expect(controller.state.isStreaming).toBe(false)
    expect(controller.state.error).toBeNull()
    // After end, all subscribers should be cleaned up
    expect(fake.captured.activeSubscribers).toBe(0)

    await sendPromise
  })

  // --- Error events ---

  it('error callback sets error, stops streaming, and resolves send() with the error', async () => {
    const sendPromise = controller.send(testRequest)
    await waitForSubscriptions(fake.captured)

    const errCb = fake.captured.errorCallbacks.get('fake-session-001')
    expect(errCb).toBeDefined()

    errCb!({ code: 'RATE_LIMITED', message: 'Too many requests' })

    expect(controller.state.error).toEqual({
      code: 'RATE_LIMITED',
      message: 'Too many requests'
    })
    expect(controller.state.isStreaming).toBe(false)
    expect(fake.captured.activeSubscribers).toBe(0)

    const result = await sendPromise
    expect(result.error).toEqual({
      code: 'RATE_LIMITED',
      message: 'Too many requests'
    })
  })

  // --- cancel() ---

  it('cancel() calls cancelStream, resolves send() with partial content and unsubscribes', async () => {
    const sendPromise = controller.send(testRequest)
    await waitForSubscriptions(fake.captured)

    fake.captured.tokenCallbacks.get('fake-session-001')!('Partial')

    await controller.cancel()

    expect(fake.captured.cancelCallCount).toBe(1)
    expect(fake.captured.cancelCallSessionIds).toEqual(['fake-session-001'])
    expect(controller.state.isStreaming).toBe(false)
    expect(fake.captured.activeSubscribers).toBe(0)

    const result = await sendPromise
    expect(result.content).toBe('Partial')
    expect(result.error).toBeNull()
    // Cancellation is flagged so callers do not persist a truncated reply.
    expect(result.cancelled).toBe(true)
  })

  it('cancel() with no active stream is a no-op', async () => {
    await controller.cancel()

    expect(fake.captured.cancelCallCount).toBe(0)
    expect(controller.state.isStreaming).toBe(false)
    expect(controller.state.error).toBeNull()
  })

  it('cancel() handles cancelStream rejection gracefully', async () => {
    const badCancel = createFakeChatAPI({ cancelError: new Error('Cancel failed') })
    const ctrl = createChatStreamController(badCancel.api)

    const sendPromise = ctrl.send(testRequest)
    await waitForSubscriptions(badCancel.captured)

    await ctrl.cancel()
    await sendPromise

    // Should still clean up state even if cancelStream fails
    expect(ctrl.state.isStreaming).toBe(false)
    expect(badCancel.captured.activeSubscribers).toBe(0)
  })

  // --- Sequential send() cancels previous ---

  it('second send() cancels the previous stream and resolves its promise', async () => {
    const firstSend = controller.send(testRequest)
    await waitForSubscriptions(fake.captured)

    // Start a second stream
    const secondSend = controller.send({ ...testRequest, userMessage: 'Another question' })

    // Wait for the second stream to be set up (cancel is async)
    await vi.waitFor(() => {
      expect(controller.state.isStreaming).toBe(true)
    })

    // The previous stream should have been cancelled
    expect(fake.captured.cancelCallCount).toBe(1)
    expect(fake.captured.cancelCallSessionIds).toEqual(['fake-session-001'])
    // Content from previous stream is cleared
    expect(controller.state.assistantContent).toBe('')
    expect(controller.state.error).toBeNull()

    const firstResult = await firstSend
    expect(firstResult.error).toBeNull()
    expect(firstResult.cancelled).toBe(true)

    await endStream(fake.captured)
    await secondSend
  })

  // --- onStateChange callback ---

  it('notifies onStateChange on state transitions', async () => {
    const stateChanges: ChatStreamState[] = []
    const ctrl = createChatStreamController(fake.api, (state) => {
      stateChanges.push({ ...state })
    })

    const sendPromise = ctrl.send(testRequest)
    await waitForSubscriptions(fake.captured)

    // Should have at least 2 changes: initial → streaming, streaming → subscribed
    expect(stateChanges.length).toBeGreaterThanOrEqual(2)

    // First change should have isStreaming=true
    const streamingEntry = stateChanges.find((s) => s.isStreaming)
    expect(streamingEntry).toBeDefined()
    expect(streamingEntry!.assistantContent).toBe('')

    await endStream(fake.captured)
    await sendPromise
  })

  it('notifies onStateChange when token arrives', async () => {
    const stateChanges: ChatStreamState[] = []
    const ctrl = createChatStreamController(fake.api, (state) => {
      stateChanges.push({ ...state })
    })

    const sendPromise = ctrl.send(testRequest)
    await waitForSubscriptions(fake.captured)
    const changesBefore = stateChanges.length

    const tokenCb = fake.captured.tokenCallbacks.get('fake-session-001')
    tokenCb!('Hi')

    // Should have at least one more change after token arrives
    expect(stateChanges.length).toBeGreaterThan(changesBefore)
    const lastState = stateChanges[stateChanges.length - 1]
    expect(lastState.assistantContent).toBe('Hi')

    await endStream(fake.captured)
    await sendPromise
  })

  // --- Initializing send() while already streaming ---

  it('send() while already streaming cancels and starts fresh', async () => {
    const firstSend = controller.send(testRequest)
    await waitForSubscriptions(fake.captured)

    // Simulate some tokens being received
    const tokenCb = fake.captured.tokenCallbacks.get('fake-session-001')
    tokenCb!('Partial response')
    expect(controller.state.assistantContent).toBe('Partial response')

    // Send a new message without cancelling first
    const secondSend = controller.send({ ...testRequest, userMessage: 'New question' })

    // Wait for the second stream to be set up (cancel is async)
    await vi.waitFor(() => {
      expect(controller.state.isStreaming).toBe(true)
    })

    // Previous should be cancelled
    expect(fake.captured.cancelCallCount).toBe(1)
    // Content should be reset
    expect(controller.state.assistantContent).toBe('')
    // New stream should be active
    expect(controller.state.error).toBeNull()

    await firstSend
    await endStream(fake.captured)
    await secondSend
  })
})
