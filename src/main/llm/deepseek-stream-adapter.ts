/**
 * DeepSeek SSE streaming fetch adapter.
 *
 * Implementation of DeepSeekStreamAdapter using raw fetch() +
 * ReadableStream. Parses Server-Sent Events (SSE) from the DeepSeek
 * streaming Chat Completions endpoint and yields DeepSeekStreamChunk
 * objects as an async iterable.
 *
 * The adapter is injected — tests provide a mock fetchImpl so no
 * network access or real API key is required.
 *
 * DeepSeek streaming protocol:
 * - POST https://api.deepseek.com/chat/completions
 * - Body: { model, messages, stream: true, stream_options: { include_usage: true } }
 * - Response: text/event-stream with lines "data: {...}\n\n"
 * - Sentinel: "data: [DONE]"
 * - Usage may arrive in final chunk or dedicated choices:[] chunk before DONE
 */

import type {
  DeepSeekStreamAdapter,
  DeepSeekStreamChunk,
  DeepSeekStreamParams,
  ReasoningEffort
} from './stream-types'
import { AppError, mapDeepSeekError } from './errors'

// ---------------------------------------------------------------
// Constants
// ---------------------------------------------------------------

const DEFAULT_ENDPOINT = 'https://api.deepseek.com/chat/completions'

// ---------------------------------------------------------------
// Factory
// ---------------------------------------------------------------

/**
 * Create a DeepSeekStreamAdapter.
 *
 * @param options.endpoint  Override the default API endpoint URL.
 * @param options.fetchImpl Inject a custom fetch implementation (for testing).
 */
export function createDeepSeekStreamAdapter(options?: {
  endpoint?: string
  fetchImpl?: typeof fetch
}): DeepSeekStreamAdapter {
  const endpoint = options?.endpoint ?? DEFAULT_ENDPOINT

  if (endpoint.startsWith('http://')) {
    throw new Error('Endpoint must use HTTPS')
  }

  const fetchImpl = options?.fetchImpl ?? fetch

  return {
    streamChat: async function* (
      params: DeepSeekStreamParams
    ): AsyncIterable<DeepSeekStreamChunk> {
      let response: Response
      try {
        response = await fetchImpl(endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${params.apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: params.model,
            messages: params.messages,
            stream: true,
            stream_options: { include_usage: true },
            ...buildThinkingParams(params.reasoningEffort)
          }),
          signal: params.signal
        })
      } catch {
        // Never surface raw fetch errors: undici includes the offending
        // header value (the API key) in its TypeError message.
        if (params.signal?.aborted) {
          throw new AppError('ABORTED', 0, '请求已取消', false)
        }
        throw new AppError(
          'NETWORK_ERROR',
          0,
          '网络连接失败：无法连接 DeepSeek，请检查网络或代理设置。',
          true
        )
      }

      // ---------------------------------------------------------
      // Non-2xx → map to AppError
      // ---------------------------------------------------------
      if (!response.ok) {
        let body: Record<string, unknown> | undefined
        try {
          body = (await response.json()) as Record<string, unknown>
        } catch {
          // Body is not valid JSON — leave body undefined so the
          // fallback message is used.
        }
        throw mapDeepSeekError(response.status, body)
      }

      // ---------------------------------------------------------
      // 2xx but no readable body → error
      // ---------------------------------------------------------
      if (!response.body) {
        throw new AppError(
          'STREAM_ERROR',
          0,
          'Response body is null — cannot read stream'
        )
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let sawAnyData = false

      try {
        while (true) {
          const result = await reader.read()

          if (result.done) {
            // Flush decoder for any multi-byte leftovers, then
            // process the final buffer (isFinal = true so the
            // last line is treated as complete).
            buffer += decoder.decode()
            const outcome = processLines(buffer, true)
            for (const chunk of outcome.chunks) yield chunk
            sawAnyData = sawAnyData || outcome.sawData
            if (!sawAnyData) {
              throw new AppError(
                'EMPTY_RESPONSE',
                200,
                '服务端返回了空的流式响应（可能被网关拦截），请重试。',
                true
              )
            }
            return
          }

          // Append decoded bytes.  stream:true prevents the decoder
          // from emitting replacement characters for incomplete
          // multi-byte sequences at chunk boundaries.
          buffer += decoder.decode(result.value, { stream: true })

          const outcome = processLines(buffer, false)

          // Keep only the incomplete trailing line for the next
          // read iteration.
          buffer = outcome.remainder

          for (const chunk of outcome.chunks) yield chunk
          sawAnyData = sawAnyData || outcome.sawData
          if (outcome.doneReceived) {
            // Release the connection as soon as the server is done.
            try {
              await reader.cancel()
            } catch {
              // Already closed.
            }
            return
          }
        }
      } finally {
        // Cancel the body so sockets are not held open when the
        // consumer stops early (abort / timeout).
        try {
          await reader.cancel()
        } catch {
          // Already closed.
        }
        try {
          reader.releaseLock()
        } catch {
          // Reader may already be released (e.g. after a cancel).
        }
      }
    }
  }
}

// ---------------------------------------------------------------
// Thinking-mode request fields
// ---------------------------------------------------------------

/**
 * Map a UI reasoning-effort preference to DeepSeek request fields.
 *
 * DeepSeek V4 supports `{"thinking": {"type": "enabled" | "disabled"}}`
 * plus `reasoning_effort`. Omitting the preference leaves the model
 * defaults untouched.
 */
function buildThinkingParams(
  effort: ReasoningEffort | undefined
): Record<string, unknown> {
  if (effort === undefined) return {}
  if (effort === 'off') {
    return { thinking: { type: 'disabled' } }
  }
  return {
    thinking: { type: 'enabled' },
    reasoning_effort: effort
  }
}

// ---------------------------------------------------------------
// SSE line processing
// ---------------------------------------------------------------

interface ProcessResult {
  chunks: DeepSeekStreamChunk[]
  doneReceived: boolean
  remainder: string
  /** True when at least one non-empty `data:` line was seen. */
  sawData: boolean
}

/**
 * Split the buffer into complete lines (terminated by \n) and parse
 * each SSE data line.
 *
 * When `isFinal` is true the final element after the last \n is also
 * processed as a complete line (the stream has ended).
 *
 * When `isFinal` is false the element after the last \n is kept as
 * the `remainder` for the next read cycle.
 */
function processLines(buffer: string, isFinal: boolean): ProcessResult {
  // Normalise CRLF: SSE events may use \r\n, and `[DONE]\r` must still
  // be recognised as the terminator.
  const lines = buffer.split('\n').map((line) =>
    line.endsWith('\r') ? line.slice(0, -1) : line
  )
  const chunks: DeepSeekStreamChunk[] = []
  let sawData = false

  // The last element may be an incomplete line — skip it unless
  // this is the final flush.
  const end = isFinal ? lines.length : lines.length - 1

  for (let i = 0; i < end; i++) {
    const line = lines[i]

    // Skip empty lines and SSE comment lines (starting with colon).
    if (line === '' || line.startsWith(':')) continue

    const trimmed = line.trimStart()
    // SSE allows `data:` with or without a single space.
    if (!trimmed.startsWith('data:')) continue

    const data = trimmed.slice(5).trim()
    if (data.length === 0) continue

    sawData = true
    if (data === '[DONE]') {
      return { chunks, doneReceived: true, remainder: '', sawData }
    }
    chunks.push(parseChunk(data))
  }

  // Compute the incomplete remainder (everything after the last \n).
  const lastIdx = buffer.lastIndexOf('\n')
  const remainder = lastIdx === -1 ? buffer : buffer.slice(lastIdx + 1)

  return { chunks, doneReceived: false, remainder, sawData }
}

// ---------------------------------------------------------------
// JSON parsing
// ---------------------------------------------------------------

/**
 * Parse a data string into a DeepSeekStreamChunk.
 *
 * Malformed JSON produces a sanitised Error — the raw data is
 * never included in the error message to avoid leaking API keys
 * or other sensitive payloads.
 */
function parseChunk(data: string): DeepSeekStreamChunk {
  let parsed: unknown
  try {
    parsed = JSON.parse(data)
  } catch {
    throw new Error(
      'Failed to parse streaming response from DeepSeek API'
    )
  }

  // A 200 response may still carry an error object (e.g. gateway).
  const record = parsed as { error?: { message?: string }; choices?: unknown }
  if (record.error !== undefined && record.choices === undefined) {
    throw new AppError(
      'INVALID_RESPONSE',
      200,
      typeof record.error.message === 'string' && record.error.message.length > 0
        ? `服务端返回错误：${record.error.message}`
        : '服务端返回了错误响应，请稍后重试。',
      true
    )
  }

  return parsed as DeepSeekStreamChunk
}
