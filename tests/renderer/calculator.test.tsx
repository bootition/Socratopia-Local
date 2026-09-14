/**
 * Tests for the local formula calculator (F23).
 */
import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  evaluateExpression,
  formatCalcValue
} from '../../src/renderer/src/chat/calculator'
import { CalculatorPanel } from '../../src/renderer/src/chat/CalculatorPanel'

afterEach(cleanup)

describe('evaluateExpression', () => {
  it('respects operator precedence and parentheses', () => {
    expect(evaluateExpression('2+3*4')).toEqual({ ok: true, value: 14 })
    expect(evaluateExpression('(2+3)*4')).toEqual({ ok: true, value: 20 })
    expect(evaluateExpression('12*(3+4)^2')).toEqual({ ok: true, value: 588 })
  })

  it('supports unary minus, powers and modulo', () => {
    expect(evaluateExpression('-3^2')).toEqual({ ok: true, value: -9 })
    expect(evaluateExpression('2^3^2')).toEqual({ ok: true, value: 512 })
    expect(evaluateExpression('17%5')).toEqual({ ok: true, value: 2 })
  })

  it('supports functions and constants', () => {
    const sqrt = evaluateExpression('sqrt(2)')
    expect(sqrt.ok && Math.abs(sqrt.value - Math.SQRT2)).toBeLessThan(1e-9)

    const circle = evaluateExpression('pi*2^2')
    expect(circle.ok && Math.abs(circle.value - Math.PI * 4)).toBeLessThan(1e-9)

    expect(evaluateExpression('max(1,7,3)')).toEqual({ ok: true, value: 7 })
    expect(evaluateExpression('round(2.6)')).toEqual({ ok: true, value: 3 })
  })

  it('accepts full-width operators and Chinese parentheses', () => {
    expect(evaluateExpression('（2＋3）×4')).toEqual({ ok: true, value: 20 })
    expect(evaluateExpression('8÷2')).toEqual({ ok: true, value: 4 })
  })

  it('returns readable errors instead of throwing', () => {
    expect(evaluateExpression('')).toEqual({ ok: false, error: '表达式为空' })
    expect(evaluateExpression('1/0')).toEqual({ ok: false, error: '除数不能为 0' })
    expect(evaluateExpression('foo(2)')).toEqual({
      ok: false,
      error: '未知函数：foo'
    })
    expect(evaluateExpression('2+')).toEqual({ ok: false, error: '表达式不完整' })
    expect(evaluateExpression('2+3)')).toEqual({
      ok: false,
      error: '表达式末尾有多余内容'
    })
  })
})

describe('formatCalcValue', () => {
  it('trims floating point noise', () => {
    expect(formatCalcValue(0.1 + 0.2)).toBe('0.3')
    expect(formatCalcValue(1 / 3)).toBe('0.333333333333')
  })
})

describe('CalculatorPanel', () => {
  it('shows a live result and inserts it into the composer', async () => {
    const user = userEvent.setup()
    const onInsert = vi.fn()
    render(<CalculatorPanel onInsert={onInsert} />)

    await user.type(screen.getByLabelText('公式'), '12*(3+4)^2')
    expect(await screen.findByText('588')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '插入结果' }))
    expect(onInsert).toHaveBeenCalledWith('= 588')
  })

  it('shows an error and disables insertion for invalid input', async () => {
    const user = userEvent.setup()
    const onInsert = vi.fn()
    render(<CalculatorPanel onInsert={onInsert} />)

    await user.type(screen.getByLabelText('公式'), '1/0')

    expect(await screen.findByText('除数不能为 0')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '插入结果' })).toBeDisabled()
    expect(onInsert).not.toHaveBeenCalled()
  })

  it('copies the result to the clipboard', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText }
    })
    render(<CalculatorPanel />)

    await user.type(screen.getByLabelText('公式'), '6*7')
    await user.click(screen.getByRole('button', { name: '复制' }))

    expect(writeText).toHaveBeenCalledWith('42')
    expect(await screen.findByText('已复制')).toBeInTheDocument()
  })
})
