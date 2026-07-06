/**
 * StreamChatSession — consumes an async iterable of SSE-like chunks
 * from a DeepSeekStreamAdapter and emits typed StreamEvents.
 *
 * Design:
 * - Owns an AbortController; its signal is passed to the adapter for
 *   true cancellation. cancel() calls controller.abort().
 * - The start() loop races each iterator.next() against the abort
 *   signal so that cancel() immediately breaks out of hanging adapters.
 * - Configurable timeout guard auto-cancels sessions that exceed the
 *   configured duration (default: 5 minutes).
 * - The adapter is injected so tests can provide mock chunk sequences
 *   without any network access or real API key.
 *
 * Security: This class runs in the main process only. It never touches
 * the renderer or ipcRenderer.
 */

import type {
  DeepSeekStreamAdapter,
  DeepSeekStreamChunk,
  StreamEvent,
  StreamTokenEvent,
  StreamErrorEvent,
  StreamEndEvent,
  StreamUsageEvent,
  DeepSeekStreamParams
} from './stream-types'

/** Default error code when the streaming adapter throws a generic error */
const STREAM_ERROR_CODE = 'STREAM_ERROR'

/** Error code emitted when the stream is cancelled or times out */
const ABORTED_ERROR_CODE = 'ABORTED'

/** Default session timeout in milliseconds (5 minutes) */
const DEFAULT_TIMEOUT_MS = 300_000

/**
 * Create a promise that rejects with an AbortError when the given
 * AbortSignal is aborted. Used with Promise.race to break out of
 * hanging async iterators on cancellation.
 */
function abortSignalToRejectingPromise(signal: AbortSignal): Promise<never> {
  return new Promise((_resolve, reject) => {
    if (signal.aborted) {
      const err = new Error('The operation was aborted')
      err.name = 'AbortError'
      reject(err)
      return
    }
    const onAbort = (): void => {
      const err = new Error('The operation was aborted')
      err.name = 'AbortError'
      reject(err)
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

export class StreamChatSession {
  private running = false
  private finished = false
  private controller: AbortController
  private timeoutHandle: ReturnType<typeof setTimeout> | null = null
  private readonly timeoutMs: number

  constructor(
    private readonly sessionId: string,
    private readonly params: DeepSeekStreamParams,
    private readonly adapter: DeepSeekStreamAdapter,
    private readonly emit: (event: StreamEvent) => void,
    timeoutMs?: number
  ) {
    this.timeoutMs = timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.controller = new AbortController()

    // Attach the signal to the params passed to the adapter
    this.params = { ...params, signal: this.controller.signal }
  }

  /** Unique identifier for this stream session */
  get id(): string {
    return this.sessionId
  }

  /** Whether the session is currently streaming */
  get isRunning(): boolean {
    return this.running
  }

  /**
   * Start consuming the adapter's async iterable.
   *
   * The returned promise resolves when the stream completes naturally,
   * is cancelled, times out, or encounters an error. The caller can use
   * cancel() from another context (e.g. an IPC cancel handler) to abort
   * early.
   */
  async start(): Promise<void> {
    if (this.running) return

    this.running = true
    this.finished = false

    // Arm the timeout guard
    this.timeoutHandle = setTimeout(() => {
      this.cancel()
    }, this.timeoutMs)

    let finishReason = 'stop'

    try {
      const stream = this.adapter.streamChat(this.params)
      const iterator = stream[Symbol.asyncIterator]()

      // Iterate manually so we can race each next() against abort
      while (true) {
        const result = await Promise.race([
          iterator.next(),
          abortSignalToRejectingPromise(this.controller.signal)
        ])

        if (result.done) break

        const chunk: DeepSeekStreamChunk = result.value

        // Extract token delta
        const deltaContent = chunk.choices?.[0]?.delta?.content
        if (deltaContent) {
          this.emitToken(deltaContent)
        }

        // Track finish reason (take first non-null)
        const chunkFinishReason = chunk.choices?.[0]?.finish_reason
        if (!this.finished && chunkFinishReason !== null && chunkFinishReason !== undefined) {
          if (typeof chunkFinishReason === 'string' && chunkFinishReason.length > 0) {
            finishReason = chunkFinishReason
          }
          this.finished = true
        }

        // Extract usage from any chunk that carries it
        if (chunk.usage) {
          this.emitUsage({
            promptTokens: chunk.usage.prompt_tokens ?? 0,
            completionTokens: chunk.usage.completion_tokens ?? 0,
            totalTokens: chunk.usage.total_tokens ?? 0
          })
        }
      }
    } catch (err) {
      // Check if this was an abort (from cancel or timeout)
      if (this.controller.signal.aborted || isAbortError(err)) {
        this.emitError(ABORTED_ERROR_CODE, 'Stream was cancelled')
      } else {
        const message = err instanceof Error ? err.message : String(err)
        this.emitError(STREAM_ERROR_CODE, message)
      }
      // Error path — skip end event
      this.clearTimeout()
      this.running = false
      return
    }

    // Normal completion — emit end if not aborted
    if (!this.controller.signal.aborted) {
      this.emitEnd(finishReason)
    }

    this.clearTimeout()
    this.running = false
  }

  /**
   * Cancel the stream by aborting the controller's signal.
   *
   * Safe to call from any context (IPC handler, timer, etc.).
   * Idempotent — calling cancel() multiple times does not throw.
   * After cancel(), the adapter's signal is aborted and the start()
   * promise will resolve with an ABORTED error event.
   */
  cancel(): void {
    try {
      this.controller.abort()
    } catch {
      // Ignore if already aborted
    }
  }

  // ---------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------

  private clearTimeout(): void {
    if (this.timeoutHandle !== null) {
      clearTimeout(this.timeoutHandle)
      this.timeoutHandle = null
    }
  }

  private emitToken(token: string): void {
    const event: StreamTokenEvent = { type: 'token', token }
    this.emit(event)
  }

  private emitError(code: string, message: string): void {
    const event: StreamErrorEvent = { type: 'error', code, message }
    this.emit(event)
  }

  private emitEnd(finishReason: string): void {
    const event: StreamEndEvent = { type: 'end', finishReason }
    this.emit(event)
  }

  private emitUsage(usage: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }): void {
    const event: StreamUsageEvent = {
      type: 'usage',
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      totalTokens: usage.totalTokens
    }
    this.emit(event)
  }
}

/**
 * Check if an unknown error is an AbortError (from our manual abort).
 */
function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError'
}
