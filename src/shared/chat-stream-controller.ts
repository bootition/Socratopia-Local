/**
 * Chat stream controller — framework-agnostic bridge over a ChatAPI.
 *
 * The controller wraps any ChatAPI implementation with managed state,
 * subscription lifecycle, cancel semantics, and a completion promise:
 * `send()` resolves only when the stream ends, errors, or is cancelled,
 * so callers can persist the assistant reply at the right moment.
 *
 * It is deliberately framework-agnostic so it can be tested without
 * React, DOM, or Electron dependencies.
 */

// --------------- types ---------------

import type { MessageSource } from './schemas/message'

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

/**
 * Classroom context sent with each stream request. The main process
 * builds the system prompt from this; the renderer never sends one.
 */
export interface ChatRequest {
  companionId: string
  textbookId: string | null
  conversationId: string | null
  userMessage: string
  model?: string
  reasoningEffort?: 'off' | 'low' | 'high' | 'max'
}

export interface StreamError {
  code: string
  message: string
}

export interface StreamUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

/** Final outcome of one `send()` call. */
export interface SendResult {
  /** Assistant content accumulated during the stream. */
  content: string
  /** Token usage, when the provider reported it. */
  usage: StreamUsage | null
  /** Stream or start error; null on success or user cancellation. */
  error: StreamError | null
  /** True when the learner cancelled the stream (partial content is not saved). */
  cancelled: boolean
  /** Textbook passages the reply was grounded in (F02). */
  sources: MessageSource[]
}

/** Result of starting a stream. */
export interface ChatStartResult {
  sessionId: string
  sources: MessageSource[]
}

export interface ChatAPI {
  startStream: (request: ChatRequest) => Promise<ChatStartResult>
  cancelStream: (sessionId: string) => Promise<void>
  onToken: (sessionId: string, callback: (token: string) => void) => () => void
  onError: (sessionId: string, callback: (error: StreamError) => void) => () => void
  onEnd: (sessionId: string, callback: (finishReason: string) => void) => () => void
  onUsage: (sessionId: string, callback: (usage: StreamUsage) => void) => () => void
}

export interface ChatStreamState {
  sessionId: string | null
  isStreaming: boolean
  error: StreamError | null
  assistantContent: string
  usage: StreamUsage | null
}

export interface CreateChatStreamControllerResult {
  readonly state: ChatStreamState
  send(request: ChatRequest): Promise<SendResult>
  cancel(): Promise<void>
}

// --------------- controller ---------------


export function createChatStreamController(
  api: ChatAPI,
  onStateChange?: (state: ChatStreamState) => void
): CreateChatStreamControllerResult {
  const state: ChatStreamState = {
    sessionId: null,
    isStreaming: false,
    error: null,
    assistantContent: '',
    usage: null
  }

  /** All active unsubscribe callbacks.  Cleared on every reset. */
  let unsubscribers: Array<() => void> = []

  /** Resolver of the `send()` promise currently in flight. */
  let settlePending: ((result: SendResult) => void) | null = null

  /** Grounding sources reported by the most recent stream start. */
  let lastSources: MessageSource[] = []

  /**
   * True while the learner has asked to cancel — including the window
   * where `startStream` is still in flight and no session id exists yet.
   * ABORTED events arriving after a local cancel are treated as a normal
   * cancellation, never as an error.
   */
  let cancelRequested = false

  function notify(): void {
    onStateChange?.({
      sessionId: state.sessionId,
      isStreaming: state.isStreaming,
      error: state.error,
      assistantContent: state.assistantContent,
      usage: state.usage
    })
  }

  function update(partial: Partial<ChatStreamState>): void {
    if ('sessionId' in partial) state.sessionId = partial.sessionId ?? null
    if ('isStreaming' in partial) state.isStreaming = partial.isStreaming ?? false
    if ('error' in partial) state.error = partial.error ?? null
    if ('assistantContent' in partial) state.assistantContent = partial.assistantContent ?? ''
    if ('usage' in partial) state.usage = partial.usage ?? null
    notify()
  }

  function unsubscribeAll(): void {
    for (const unsub of unsubscribers) {
      unsub()
    }
    unsubscribers = []
  }

  /** Resolve the pending send() exactly once. */
  function finish(result: SendResult): void {
    const settle = settlePending
    settlePending = null
    settle?.(result)
  }

  function currentResult(error: StreamError | null, cancelled = false): SendResult {
    return {
      content: state.assistantContent,
      usage: state.usage,
      error,
      cancelled,
      sources: lastSources
    }
  }

  function resetState(): void {
    cancelRequested = false
    unsubscribeAll()
    update({
      sessionId: null,
      isStreaming: true,
      error: null,
      assistantContent: '',
      usage: null
    })
  }

  async function cancel(): Promise<void> {
    // Set synchronously: a cancel during the startStream window must be
    // remembered, otherwise the stream would keep running unseen.
    cancelRequested = true

    const activeSessionId = state.sessionId
    if (activeSessionId !== null) {
      try {
        await api.cancelStream(activeSessionId)
      } catch {
        // Best-effort — always clean up local state regardless
      }
    }

    // A user cancellation is not an error, but the partial draft must
    // not be persisted: settle with `cancelled: true`.
    finish(currentResult(null, true))

    unsubscribeAll()
    update({
      sessionId: null,
      isStreaming: false,
      error: null,
      assistantContent: '',
      usage: null
    })
  }

  async function send(request: ChatRequest): Promise<SendResult> {
    // Cancel any in-flight stream and settle its promise with the
    // partial content it already produced.
    if (state.sessionId !== null) {
      cancelRequested = true
      finish(currentResult(null, true))
      try {
        await api.cancelStream(state.sessionId)
      } catch {
        // Best-effort — proceed regardless
      }
      unsubscribeAll()
    }

    resetState()

    let started: ChatStartResult
    try {
      started = await api.startStream(request)
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Unknown stream start error'
      const error: StreamError = { code: 'STREAM_START_FAILED', message }
      lastSources = []
      update({ sessionId: null, isStreaming: false, error })
      return { content: '', usage: null, error, cancelled: false, sources: [] }
    }

    const sessionId = started.sessionId
    lastSources = started.sources

    // The learner pressed stop (or left the page) while the main process
    // was still assembling the prompt: cancel the now-known session and
    // settle as a cancellation instead of streaming on.
    if (cancelRequested) {
      try {
        await api.cancelStream(sessionId)
      } catch {
        // Best-effort — the session may already be finished.
      }
      cancelRequested = false
      update({
        sessionId: null,
        isStreaming: false,
        error: null,
        assistantContent: '',
        usage: null
      })
      return { content: '', usage: null, error: null, cancelled: true, sources: [] }
    }

    update({ sessionId })

    return new Promise<SendResult>((resolve) => {
      settlePending = resolve

      // Subscribe to stream events
      const unsubToken = api.onToken(sessionId, (token: string) => {
        update({ assistantContent: state.assistantContent + token })
      })

      const unsubError = api.onError(sessionId, (err: StreamError) => {
        unsubscribeAll()
        // An ABORTED event racing with a local cancel is not an error.
        if (cancelRequested) {
          cancelRequested = false
          update({ error: null, isStreaming: false })
          finish(currentResult(null, true))
          return
        }
        update({ error: err, isStreaming: false })
        finish(currentResult(err))
      })

      const unsubEnd = api.onEnd(sessionId, (_finishReason: string) => {
        unsubscribeAll()
        update({ isStreaming: false })
        finish(currentResult(null))
      })

      const unsubUsage = api.onUsage(sessionId, (usage: StreamUsage) => {
        update({ usage })
      })

      unsubscribers = [unsubToken, unsubError, unsubEnd, unsubUsage]
    })
  }

  return {
    get state() {
      return {
        sessionId: state.sessionId,
        isStreaming: state.isStreaming,
        error: state.error,
        assistantContent: state.assistantContent,
        usage: state.usage
      }
    },
    send,
    cancel
  }
}
