/**
 * Tests for describeStreamError — actionable error messages.
 */
import { describe, expect, it } from 'vitest'

import { describeStreamError } from '../../src/renderer/src/chat/error-messages'

describe('describeStreamError', () => {
  it('maps an invalid key to a settings action', () => {
    const friendly = describeStreamError({
      code: 'UNAUTHORIZED',
      message: 'Authentication Fails'
    })
    expect(friendly.title).toContain('API Key 无效')
    expect(friendly.hint).toContain('设置')
    expect(friendly.detail).toBe('Authentication Fails')
  })

  it('maps balance, rate limit and server errors', () => {
    expect(describeStreamError({ code: 'INSUFFICIENT_BALANCE', message: 'x' }).title).toContain('余额')
    expect(describeStreamError({ code: 'RATE_LIMITED', message: 'x' }).hint).toContain('稍等')
    expect(describeStreamError({ code: 'SERVICE_UNAVAILABLE', message: 'x' }).title).toContain('暂时不可用')
  })

  it('keeps the raw start-failure message as detail', () => {
    const friendly = describeStreamError({
      code: 'STREAM_START_FAILED',
      message: 'Connection refused'
    })
    expect(friendly.title).toContain('无法开始回复')
    expect(friendly.detail).toBe('Connection refused')
  })

  it('has no detail for a clean user cancellation', () => {
    const friendly = describeStreamError({ code: 'ABORTED', message: 'Stream was cancelled' })
    expect(friendly.title).toBe('已停止')
    expect(friendly.detail).toBeNull()
  })
})
