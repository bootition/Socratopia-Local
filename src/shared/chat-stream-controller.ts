/**
 * Chat stream controller — framework-agnostic bridge over a ChatAPI.
 *
 * The controller wraps any ChatAPI implementation with managed state,
 * subscription lifecycle, and cancel semantics.  It is deliberately
 * framework-agnostic so it can be tested without React, DOM, or Electron
 * dependencies.
 *
 * Exported types and the controller function are designed to live in the
 * shared module so they are reachable from both node-side tests
 * (tsconfig.node.json) and the renderer (tsconfig.web.json).
 */

// --------------- types ---------------

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

export interface StreamError {
  code: string
  message: string
}

export interface StreamUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export interface ChatAPI {
  startStream: (messages: ChatMessage[], model?: string) => Promise<string>
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
  send(messages: ChatMessage[], model?: string): Promise<void>
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

  function resetState(): void {
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
    if (state.sessionId !== null) {
      try {
        await api.cancelStream(state.sessionId)
      } catch {
        // Best-effort — always clean up local state regardless
      }
    }
    unsubscribeAll()
    update({
      sessionId: null,
      isStreaming: false,
      error: null,
      assistantContent: '',
      usage: null
    })
  }

  async function send(
    messages: ChatMessage[],
    model?: string
  ): Promise<void> {
    // Cancel any in-flight stream
    if (state.sessionId !== null) {
      try {
        await api.cancelStream(state.sessionId)
      } catch {
        // Best-effort — proceed regardless
      }
      unsubscribeAll()
    }

    resetState()

    let sessionId: string
    try {
      sessionId = await api.startStream(messages, model)
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Unknown stream start error'
      update({
        sessionId: null,
        isStreaming: false,
        error: { code: 'STREAM_START_FAILED', message }
      })
      return
    }

    update({ sessionId })

    // Subscribe to stream events
    const unsubToken = api.onToken(sessionId, (token: string) => {
      update({ assistantContent: state.assistantContent + token })
    })

    const unsubError = api.onError(sessionId, (err: StreamError) => {
      unsubscribeAll()
      update({ error: err, isStreaming: false })
    })

    const unsubEnd = api.onEnd(sessionId, (_finishReason: string) => {
      unsubscribeAll()
      update({ isStreaming: false })
    })

    const unsubUsage = api.onUsage(sessionId, (usage: StreamUsage) => {
      update({ usage })
    })

    unsubscribers = [unsubToken, unsubError, unsubEnd, unsubUsage]
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
