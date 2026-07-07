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
  DeepSeekStreamParams
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
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${params.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: params.model,
          messages: params.messages,
          stream: true,
          stream_options: { include_usage: true }
        }),
        signal: params.signal
      })

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
          if (outcome.doneReceived) return
        }
      } finally {
        // Release the reader lock so the underlying connection can
        // be torn down.
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
// SSE line processing
// ---------------------------------------------------------------

interface ProcessResult {
  chunks: DeepSeekStreamChunk[]
  doneReceived: boolean
  remainder: string
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
  const lines = buffer.split('\n')
  const chunks: DeepSeekStreamChunk[] = []

  // The last element may be an incomplete line — skip it unless
  // this is the final flush.
  const end = isFinal ? lines.length : lines.length - 1

  for (let i = 0; i < end; i++) {
    const line = lines[i]

    // Skip empty lines and SSE comment lines (starting with colon).
    if (line === '' || line.startsWith(':')) continue

    const trimmed = line.trimStart()
    if (trimmed.startsWith('data: ')) {
      const data = trimmed.slice(6)
      if (data === '[DONE]') {
        return { chunks, doneReceived: true, remainder: '' }
      }
      chunks.push(parseChunk(data))
    }
  }

  // Compute the incomplete remainder (everything after the last \n).
  const lastIdx = buffer.lastIndexOf('\n')
  const remainder = lastIdx === -1 ? buffer : buffer.slice(lastIdx + 1)

  return { chunks, doneReceived: false, remainder }
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
  try {
    return JSON.parse(data) as DeepSeekStreamChunk
  } catch {
    throw new Error(
      'Failed to parse streaming response from DeepSeek API'
    )
  }
}
