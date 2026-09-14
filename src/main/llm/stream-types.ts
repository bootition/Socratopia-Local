/**
 * Streaming chat types and adapter contract.
 *
 * A StreamChatSession consumes an async iterable of SSE-like chunks
 * produced by a DeepSeekStreamAdapter and emits typed StreamEvents.
 *
 * The adapter is injected so tests can provide a mock async iterable
 * without any network access or real API key.
 */

import type { DeepSeekChatMessage } from './types'

// ---------------------------------------------------------------
// Stream events (pushed to renderer via IPC)
// ---------------------------------------------------------------

export interface StreamTokenEvent {
  type: 'token'
  token: string
}

export interface StreamErrorEvent {
  type: 'error'
  code: string
  message: string
}

export interface StreamEndEvent {
  type: 'end'
  finishReason: string
}

export interface StreamUsageEvent {
  type: 'usage'
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export type StreamEvent =
  | StreamTokenEvent
  | StreamErrorEvent
  | StreamEndEvent
  | StreamUsageEvent

// ---------------------------------------------------------------
// SSE-like chunk from the streaming adapter
// ---------------------------------------------------------------

/**
 * Single chunk produced by the streaming adapter.
 *
 * Matches the shape of DeepSeek/OpenAI streaming SSE data rows that
 * contain "choices" with a delta object.
 */
export interface DeepSeekStreamChunk {
  choices?: Array<{
    delta?: {
      content?: string
      /** Thinking-mode chain of thought; intentionally not shown as reply text. */
      reasoning_content?: string
    }
    finish_reason?: string | null
  }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
}

// ---------------------------------------------------------------
// Streaming adapter contract
// ---------------------------------------------------------------

/**
 * Thinking-mode depth for DeepSeek V4 models.
 * 'off' disables thinking; 'low' | 'high' | 'max' map to reasoning_effort.
 */
export type ReasoningEffort = 'off' | 'low' | 'high' | 'max'

export interface DeepSeekStreamParams {
  model: string
  messages: DeepSeekChatMessage[]
  apiKey: string
  /** AbortSignal for true cancellation. The adapter MUST observe this. */
  signal?: AbortSignal
  /**
   * Thinking-mode effort. When omitted the model default is used.
   * The adapter maps this to `thinking` + `reasoning_effort`.
   */
  reasoningEffort?: ReasoningEffort
}

/**
 * Injected adapter that performs the streaming HTTP POST and returns
 * an async iterable of chunks.
 *
 * Real implementation: uses fetch() with ReadableStream, yields parsed
 * SSE data lines.
 * Mock implementation: yields pre-built chunks for testing.
 */
export interface DeepSeekStreamAdapter {
  streamChat(params: DeepSeekStreamParams): AsyncIterable<DeepSeekStreamChunk>
}
