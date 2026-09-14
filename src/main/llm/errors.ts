/**
 * Application-level error type and DeepSeek HTTP status → error mapping.
 *
 * Every error thrown by the DeepSeekClient is an instance of AppError
 * so upstream code can pattern-match on `code` without parsing messages.
 */

// ---------------------------------------------------------------
// AppError
// ---------------------------------------------------------------

export class AppError extends Error {
  /** Machine-readable error code (e.g. "UNAUTHORIZED", "RATE_LIMITED") */
  readonly code: string

  /** Original HTTP status code (or 0 for non-HTTP errors) */
  readonly httpStatus: number

  /** Whether the operation is safe to retry (e.g. 429, 500, 503) */
  readonly retryable: boolean

  constructor(code: string, httpStatus: number, message: string, retryable = false) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.httpStatus = httpStatus
    this.retryable = retryable
  }
}

// ---------------------------------------------------------------
// Error mapping: DeepSeek HTTP status → AppError
// ---------------------------------------------------------------

interface ErrorMapping {
  code: string
  retryable: boolean
}

const STATUS_TO_ERROR: Record<number, ErrorMapping> = {
  400: { code: 'INVALID_REQUEST', retryable: false },
  401: { code: 'UNAUTHORIZED', retryable: false },
  402: { code: 'INSUFFICIENT_BALANCE', retryable: false },
  403: { code: 'FORBIDDEN', retryable: false },
  408: { code: 'TIMEOUT', retryable: true },
  422: { code: 'INVALID_PARAMETER', retryable: false },
  429: { code: 'RATE_LIMITED', retryable: true },
  500: { code: 'SERVER_ERROR', retryable: true },
  502: { code: 'SERVER_ERROR', retryable: true },
  503: { code: 'SERVICE_UNAVAILABLE', retryable: true },
  504: { code: 'TIMEOUT', retryable: true }
}

const DEFAULT_ERROR: ErrorMapping = {
  code: 'UNKNOWN_ERROR',
  retryable: false
}

/**
 * Map an HTTP status and optional DeepSeek error body to an AppError.
 *
 * Uses the documented DeepSeek error codes when available, and falls
 * back to the status-based mapping for unrecognised codes.
 */
export function mapDeepSeekError(
  status: number,
  body?: Record<string, unknown>
): AppError {
  const errorBody = body?.error as Record<string, unknown> | undefined
  const serverMessage =
    typeof errorBody?.message === 'string' ? errorBody.message : undefined

  const mapping = STATUS_TO_ERROR[status] ?? DEFAULT_ERROR
  const fallback =
    status === 0
      ? '网络连接失败：无法连接 DeepSeek，请检查网络或代理设置'
      : `DeepSeek API error (HTTP ${status})`
  const message = serverMessage ?? fallback

  return new AppError(mapping.code, status, message, mapping.retryable)
}

/**
 * Chinese, actionable description for user-facing surfaces (settings
 * test, end-class errors). The raw server message is preserved when it
 * carries extra information.
 */
export function describeDeepSeekError(err: unknown): string {
  if (err instanceof AppError) {
    switch (err.code) {
      case 'UNAUTHORIZED':
        return 'API Key 无效或已过期，请在设置里重新填写。'
      case 'INSUFFICIENT_BALANCE':
        return 'DeepSeek 账户余额不足，请充值后重试。'
      case 'RATE_LIMITED':
        return '请求过于频繁（触发限流），请稍等几秒再试。'
      case 'SERVER_ERROR':
      case 'SERVICE_UNAVAILABLE':
        return 'DeepSeek 服务暂时不可用，请稍后重试。'
      case 'INVALID_REQUEST':
      case 'INVALID_PARAMETER':
        return '请求被 DeepSeek 拒绝（模型或参数问题），请检查设置中的模型。'
      case 'FORBIDDEN':
        return 'DeepSeek 拒绝了这次请求（403），请检查账号状态与模型权限。'
      case 'MISSING_API_KEY':
        return '还没有配置 DeepSeek API Key。'
      case 'TIMEOUT':
        return '等待 DeepSeek 响应超时，请稍后重试（已生成的部分会保留）。'
      case 'NETWORK_ERROR':
        return '网络连接失败：无法连接 DeepSeek，请检查网络或代理设置。'
      case 'INVALID_RESPONSE':
        return '服务端返回了无法解析的响应，请稍后重试。'
      case 'EMPTY_RESPONSE':
        return 'DeepSeek 返回了空响应（可能被网关拦截），请重试。'
      default:
        return err.message
    }
  }
  if (err instanceof Error) return err.message
  return '未知错误'
}
