/**
 * StreamChatSession — consumes an async iterable of SSE-like chunks
 * from a DeepSeekStreamAdapter and emits typed StreamEvents.
 *
 * Design:
 * - Owns an AbortController; its signal is passed to the adapter for
 *   true cancellation. cancel() calls controller.abort().
 * - The start() loop races each iterator.next() against the abort
 *   signal so that cancel() immediately breaks out of hanging adapters.
 * - Configurable inactivity timeout auto-cancels sessions that receive
 *   no data for the configured duration (default: 5 minutes).
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
import { AppError } from './errors'

/** Default error code when the streaming adapter throws a generic error */
const STREAM_ERROR_CODE = 'STREAM_ERROR'

/** Error code emitted when the stream is cancelled or times out */
const ABORTED_ERROR_CODE = 'ABORTED'

/** Default inactivity timeout in milliseconds (5 minutes without data) */
// No hard total cap by default: a long thinking-mode reply can stream
// for a long time, and the inactivity window above is the real guard
// against a dead connection. Deployments that need a ceiling can pass
// maxTotalMs explicitly.
const DEFAULT_MAX_TOTAL_MS = Number.POSITIVE_INFINITY

/** Scrub anything key-shaped or control-character-ish out of provider error messages. */
function scrubControlChars(value: string): string {
  let result = ''
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0
    result += code < 32 || code === 127 ? ' ' : char
  }
  return result
}

function scrubSecrets(message: string): string {
  return scrubControlChars(
    message
      .replace(/sk-[A-Za-z0-9_-]{4,}/g, 'sk-***')
      .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer ***')
  )
}

/** Inactivity timeout in milliseconds (5 minutes without data) */
const DEFAULT_TIMEOUT_MS = 300_000

interface AbortGuard {
  /** Rejects with an AbortError as soon as the signal is aborted. */
  promise: Promise<never>
  /** Removes the underlying abort listener (idempotent). */
  dispose: () => void
}

/**
 * Create a single promise that rejects with an AbortError when the
 * given AbortSignal is aborted, plus a dispose function that removes
 * the listener again.
 *
 * The guard must be created ONCE per session and reused for every
 * Promise.race iteration. Creating one per chunk (the previous
 * implementation) leaked one `abort` listener per streamed chunk,
 * which grows unbounded for long replies.
 */
function createAbortGuard(signal: AbortSignal): AbortGuard {
  let onAbort: (() => void) | null = null

  const promise = new Promise<never>((_resolve, reject) => {
    const fail = (): void => {
      const err = new Error('The operation was aborted')
      err.name = 'AbortError'
      reject(err)
    }

    if (signal.aborted) {
      fail()
      return
    }

    onAbort = fail
    signal.addEventListener('abort', fail, { once: true })
  })

  // Mark the rejection as handled so an abort arriving after the last
  // race has settled cannot surface as an unhandled rejection.
  void promise.catch(() => {})

  return {
    promise,
    dispose: () => {
      if (onAbort !== null) {
        signal.removeEventListener('abort', onAbort)
        onAbort = null
      }
    }
  }
}

export class StreamChatSession {
  private running = false
  private finished = false
  private controller: AbortController
  private timeoutHandle: ReturnType<typeof setTimeout> | null = null
  private readonly timeoutMs: number
  private readonly maxTotalMs: number
  private timedOut = false

  constructor(
    private readonly sessionId: string,
    private readonly params: DeepSeekStreamParams,
    private readonly adapter: DeepSeekStreamAdapter,
    private readonly emit: (event: StreamEvent) => void,
    timeoutMs?: number,
    maxTotalMs?: number
  ) {
    this.timeoutMs = timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.maxTotalMs = maxTotalMs ?? DEFAULT_MAX_TOTAL_MS
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
    this.timedOut = false
    const startedAt = Date.now()

    // Arm the inactivity timeout guard. It is re-armed on every chunk, so
    // a long but healthy reply (e.g. thinking mode with effort=max) is not
    // cut off after a fixed total duration.
    this.armTimeout()

    // Single abort guard reused for every iteration — never per chunk.
    const abortGuard = createAbortGuard(this.controller.signal)

    let finishReason = 'stop'

    let iterator: AsyncIterator<DeepSeekStreamChunk> | undefined

    try {
      const stream = this.adapter.streamChat(this.params)
      iterator = stream[Symbol.asyncIterator]()

      // Iterate manually so we can race each next() against abort
      while (true) {
        const result = await Promise.race([iterator.next(), abortGuard.promise])

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

        // Only real progress (content, thinking, usage or a finish
        // reason) restarts the inactivity window. Empty keep-alive
        // chunks must not keep a dead stream alive forever.
        const hasPayload =
          Boolean(deltaContent) ||
          Boolean(chunk.choices?.[0]?.delta?.reasoning_content) ||
          Boolean(chunk.usage) ||
          chunkFinishReason !== null && chunkFinishReason !== undefined
        if (hasPayload) this.armTimeout()

        if (Date.now() - startedAt > this.maxTotalMs) {
          this.timedOut = true
          this.cancel()
        }
      }

      // Normal completion — emit end if not aborted
      if (!this.controller.signal.aborted) {
        this.emitEnd(finishReason)
      }
    } catch (err) {
      // Check if this was an abort (from cancel or timeout)
      if (this.controller.signal.aborted || isAbortError(err)) {
        if (this.timedOut) {
          this.emitError(
            'TIMEOUT',
            '等待 DeepSeek 响应超时（长时间没有新内容），已停止本次回复。'
          )
        } else {
          this.emitError(ABORTED_ERROR_CODE, 'Stream was cancelled')
        }
      } else {
        // Keep the provider error code (UNAUTHORIZED / INSUFFICIENT_BALANCE
        // / RATE_LIMITED ...) so the renderer can show an actionable
        // message instead of a generic stream failure.
        const code = err instanceof AppError ? err.code : STREAM_ERROR_CODE
        const message = scrubSecrets(
          err instanceof Error ? err.message : String(err)
        )
        this.emitError(code, message)
      }
      // Error path — skip end event
    } finally {
      abortGuard.dispose()
      this.clearTimeout()
      // Release the adapter's async iterator (and its HTTP body) when
      // the loop exits early through cancel/timeout. Fire-and-forget: a
      // generator suspended on a never-resolving await would otherwise
      // block start() forever.
      if (this.controller.signal.aborted && iterator !== undefined) {
        try {
          const closing = iterator.return?.(undefined)
          if (closing !== undefined) {
            void Promise.resolve(closing).catch(() => undefined)
          }
        } catch {
          // Best effort.
        }
      }
      this.running = false
    }
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

  /**
   * (Re-)arm the inactivity timeout. Called once at start and after
   * every received chunk; `clearTimeout` on completion/cancel.
   */
  private armTimeout(): void {
    if (this.timeoutMs <= 0) return
    this.clearTimeout()
    this.timeoutHandle = setTimeout(() => {
      this.timedOut = true
      this.cancel()
    }, this.timeoutMs)
  }

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
