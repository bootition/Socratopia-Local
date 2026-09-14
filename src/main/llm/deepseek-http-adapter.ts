/**
 * DeepSeek HTTP adapter — non-streaming chat completion via fetch.
 *
 * Implements {@link DeepSeekApiAdapter} by POSTing to the raw DeepSeek
 * REST endpoint.  The adapter is pure infrastructure: it never modifies
 * the request payload or interprets error bodies — that responsibility
 * belongs to {@link DeepSeekClient} and {@link mapDeepSeekError}.
 *
 * The adapter intentionally does NOT log, persist, or return the API key
 * in any form.
 */

import type {
  DeepSeekApiAdapter,
  DeepSeekApiParams,
  DeepSeekApiResult
} from './types'

// ---------------------------------------------------------------
// Options
// ---------------------------------------------------------------

export interface DeepSeekHttpAdapterOptions {
  /**
   * Override the default endpoint.
   *
   * @default "https://api.deepseek.com/chat/completions"
   */
  endpoint?: string

  /**
   * Inject a custom fetch implementation (useful in tests).
   *
   * @default globalThis.fetch
   */
  fetchImpl?: typeof fetch

  /**
   * Request timeout in milliseconds. A hung request resolves as a
   * network failure instead of padding the UI forever.
   *
   * @default 120000
   */
  timeoutMs?: number
}

// ---------------------------------------------------------------
// Factory
// ---------------------------------------------------------------

/**
 * Create a non-streaming DeepSeek HTTP adapter.
 *
 * The returned adapter conforms to {@link DeepSeekApiAdapter} so it can
 * be injected directly into {@link DeepSeekClient}.  All network details
 * — endpoint, headers, JSON serialisation — are encapsulated here.
 */
export function createDeepSeekHttpAdapter(
  options: DeepSeekHttpAdapterOptions = {}
): DeepSeekApiAdapter {
  const endpoint =
    options.endpoint ?? 'https://api.deepseek.com/chat/completions'

  if (endpoint.startsWith('http://')) {
    throw new Error('Endpoint must use HTTPS')
  }

  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  const timeoutMs = options.timeoutMs ?? 120_000

  return {
    async chatCompletion(
      params: DeepSeekApiParams
    ): Promise<DeepSeekApiResult> {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)

      try {
        const response = await fetchImpl(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${params.apiKey}`
          },
          body: JSON.stringify({
            model: params.model,
            messages: params.messages,
            stream: false,
            ...(params.maxTokens !== undefined
              ? { max_tokens: params.maxTokens }
              : {})
          }),
          signal: controller.signal
        })

        if (response.ok) {
          try {
            const data = await response.json()
            return { ok: true, data }
          } catch {
            // 2xx with a non-JSON body (gateway page, empty body, ...).
            return { ok: false, status: response.status, errorCode: 'INVALID_RESPONSE' }
          }
        }

        let body: Record<string, unknown> | undefined
        try {
          body = (await response.json()) as Record<string, unknown>
        } catch {
          // Response body is not valid JSON — leave body undefined so
          // mapDeepSeekError falls back to its status-based default message.
        }

        return { ok: false, status: response.status, body }
      } catch {
        // Never attach the raw Error object — undici error messages can
        // include header values (i.e. the API key).
        return controller.signal.aborted
          ? { ok: false, status: 0, errorCode: 'TIMEOUT' as const }
          : { ok: false, status: 0, errorCode: 'NETWORK_ERROR' as const }
      } finally {
        clearTimeout(timer)
      }
    }
  }
}
