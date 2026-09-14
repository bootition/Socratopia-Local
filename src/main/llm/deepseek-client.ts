/**
 * Main-process DeepSeek chat client.
 *
 * Design:
 * - Constructor receives an API key (plaintext) and an injected adapter.
 * - The adapter performs the actual HTTP call; tests inject a mock.
 * - The client only adds: model selection, request validation,
 *   response extraction, and error mapping.
 * - The API key is passed through to the adapter and never exposed
 *   outside this file's constructor.
 */

import type {
  DeepSeekApiAdapter,
  DeepSeekModel,
  DeepSeekChatMessage,
  DeepSeekChatResponse
} from './types'
import { DEEPSEEK_V4_PRO } from './types'
import { AppError, mapDeepSeekError } from './errors'

export class DeepSeekClient {
  private readonly apiKey: string
  private readonly adapter: DeepSeekApiAdapter
  private readonly defaultModel: DeepSeekModel

  /**
   * @param apiKey    Plaintext DeepSeek API key (validated non-empty).
   * @param adapter   Injected HTTP adapter.
   * @param defaultModel  Default model when chat() is called without
   *                      an explicit model.  Defaults to DEEPSEEK_V4_PRO.
   */
  constructor(
    apiKey: string,
    adapter: DeepSeekApiAdapter,
    defaultModel: DeepSeekModel = DEEPSEEK_V4_PRO
  ) {
    if (apiKey.trim().length === 0) {
      throw new AppError(
        'MISSING_API_KEY',
        0,
        'DeepSeek API key is required but was empty'
      )
    }

    this.apiKey = apiKey
    this.adapter = adapter
    this.defaultModel = defaultModel
  }

  /**
   * Send a non-streaming chat request to DeepSeek and return the
   * first assistant choice as a typed response.
   *
   * @param messages  Ordered conversation messages (system/user/assistant).
   * @param options   Optional overrides (currently: model).
   */
  async chat(
    messages: DeepSeekChatMessage[],
    options?: { model?: DeepSeekModel; maxTokens?: number }
  ): Promise<DeepSeekChatResponse> {
    const model = options?.model ?? this.defaultModel

    const result = await this.adapter.chatCompletion({
      model,
      messages,
      apiKey: this.apiKey,
      ...(options?.maxTokens !== undefined ? { maxTokens: options.maxTokens } : {})
    })

    if (!result.ok) {
      if (result.errorCode === 'TIMEOUT') {
        throw new AppError(
          'TIMEOUT',
          0,
          '请求超时：DeepSeek 120 秒内没有响应，请稍后重试。',
          true
        )
      }
      if (result.errorCode === 'NETWORK_ERROR') {
        throw new AppError(
          'NETWORK_ERROR',
          0,
          '网络连接失败：无法连接 DeepSeek，请检查网络或代理设置。',
          true
        )
      }
      if (result.errorCode === 'INVALID_RESPONSE') {
        throw new AppError(
          'INVALID_RESPONSE',
          result.status,
          '服务端返回了无法解析的响应，请稍后重试。',
          true
        )
      }
      throw mapDeepSeekError(result.status, result.body)
    }

    return extractChatResponse(result.data)
  }
}

// ---------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------

function extractChatResponse(data: {
  model?: string
  choices?: Array<{
    message?: { role?: string; content?: string }
    finish_reason?: string
  }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
}): DeepSeekChatResponse {
  const choice = data.choices?.[0]

  if (!choice?.message?.content) {
    throw new AppError(
      'EMPTY_RESPONSE',
      0,
      'DeepSeek 返回了空的响应（可能被安全策略拦截或模型异常），请重试。',
      true
    )
  }

  return {
    content: choice.message.content,
    model: data.model ?? 'unknown',
    finishReason: choice.finish_reason ?? null,
    usage: {
      promptTokens: data.usage?.prompt_tokens ?? 0,
      completionTokens: data.usage?.completion_tokens ?? 0,
      totalTokens: data.usage?.total_tokens ?? 0
    }
  }
}
