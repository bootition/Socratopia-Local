/**
 * DeepSeek LLM domain types, constants, and the injected adapter contract.
 *
 * The adapter pattern decouples the client from any specific HTTP library
 * (fetch, OpenAI SDK, etc.) so unit tests can inject a mock adapter that
 * requires no network access or real API key.
 *
 * All types in this module are safe to import from main-process code only.
 */

// ---------------------------------------------------------------
// Model constants
// ---------------------------------------------------------------

/** Recommended default: best reasoning, complex dialogue */
export const DEEPSEEK_V4_PRO = 'deepseek-v4-pro' as const

/** Fast / economical: summaries, flashcards, lightweight tasks */
export const DEEPSEEK_V4_FLASH = 'deepseek-v4-flash' as const

export type DeepSeekModel = typeof DEEPSEEK_V4_PRO | typeof DEEPSEEK_V4_FLASH

// ---------------------------------------------------------------
// Chat message types
// ---------------------------------------------------------------

export type DeepSeekRole = 'system' | 'user' | 'assistant'

export interface DeepSeekChatMessage {
  role: DeepSeekRole
  content: string
}

// ---------------------------------------------------------------
// Raw adapter contract
// ---------------------------------------------------------------

/**
 * Shape of the opaque data the adapter returns on success.
 *
 * This loosely matches the OpenAI Chat Completion response; the client
 * will extract typed fields from it without assuming every property is
 * present.
 */
export interface DeepSeekCompletionData {
  id?: string
  object?: string
  created?: number
  model?: string
  choices?: Array<{
    index?: number
    message?: { role?: string; content?: string }
    finish_reason?: string
  }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
}

/**
 * Discriminated union returned by the injected adapter.
 *
 * - `ok: true`  → the HTTP call succeeded (status 2xx)
 * - `ok: false` → the HTTP call failed with a non-2xx status
 */
export type DeepSeekApiResult =
  | { ok: true; data: DeepSeekCompletionData }
  | {
      ok: false
      status: number
      body?: Record<string, unknown>
      /** Fine-grained failure kind so callers can map it to a clear message. */
      errorCode?: 'TIMEOUT' | 'NETWORK_ERROR' | 'INVALID_RESPONSE'
    }

/**
 * Parameters the DeepSeekClient passes to the adapter.
 *
 * The adapter MUST use the `apiKey` for Bearer authentication and
 * MUST NOT hard-code or read the key from any other source.
 */
export interface DeepSeekApiParams {
  model: string
  messages: DeepSeekChatMessage[]
  apiKey: string
  /** Optional output cap (used by the connection test). */
  maxTokens?: number
}

/**
 * Injected adapter that performs the actual HTTP POST to DeepSeek.
 *
 * Every implementation — real (fetch/OpenAI SDK) or mock — conforms to
 * this interface so the client never touches the network directly.
 */
export interface DeepSeekApiAdapter {
  chatCompletion(params: DeepSeekApiParams): Promise<DeepSeekApiResult>
}

// ---------------------------------------------------------------
// Typed client return value
// ---------------------------------------------------------------

export interface DeepSeekChatResponse {
  content: string
  model: string
  finishReason: string | null
  usage: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}
