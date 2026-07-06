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
  422: { code: 'INVALID_PARAMETER', retryable: false },
  429: { code: 'RATE_LIMITED', retryable: true },
  500: { code: 'SERVER_ERROR', retryable: true },
  503: { code: 'SERVICE_UNAVAILABLE', retryable: true }
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
  const message = serverMessage ?? `DeepSeek API error (HTTP ${status})`

  return new AppError(mapping.code, status, message, mapping.retryable)
}
