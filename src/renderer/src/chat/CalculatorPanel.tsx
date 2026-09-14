import { useState } from 'react'
import { evaluateExpression, formatCalcValue } from './calculator'

export interface CalculatorPanelProps {
  /** Insert the formatted result into the message composer. */
  onInsert?: (text: string) => void
  onClose?: () => void
}

/**
 * Local formula calculator (F23). Evaluation happens in the renderer,
 * calls no AI, and costs no tokens. Useful for checking the numbers in
 * a textbook or a worked example before asking the companion.
 */
export function CalculatorPanel({
  onInsert,
  onClose
}: CalculatorPanelProps): React.ReactElement {
  const [expression, setExpression] = useState('')
  const [copied, setCopied] = useState(false)

  const result = evaluateExpression(expression)
  const hasInput = expression.trim().length > 0
  const display = !hasInput
    ? '输入算式，例如 12*(3+4)^2 或 sqrt(2)'
    : result.ok
      ? formatCalcValue(result.value)
      : result.error

  async function copy(): Promise<void> {
    if (!result.ok) return
    try {
      await navigator.clipboard.writeText(formatCalcValue(result.value))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard may be unavailable; the value is still visible.
    }
  }

  return (
    <div
      aria-label="计算器"
      className="border-b border-[var(--border)] bg-[var(--background)] p-3"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (onInsert !== undefined && result.ok) {
            onInsert(`= ${formatCalcValue(result.value)}`)
          }
        }}
        className="flex items-center gap-2"
      >
        <label htmlFor="calculator-expression" className="sr-only">
          公式
        </label>
        <input
          id="calculator-expression"
          aria-label="公式"
          autoFocus
          value={expression}
          onChange={(event) => {
            setExpression(event.target.value)
            setCopied(false)
          }}
          placeholder="12*(3+4)^2"
          className="flex-1 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 font-mono text-sm text-[var(--foreground)] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
        />
        <button
          type="submit"
          disabled={!result.ok}
          className="rounded-md bg-[var(--primary)] px-3 py-1.5 text-xs font-medium text-[var(--primary-foreground)] disabled:opacity-50"
        >
          插入结果
        </button>
        <button
          type="button"
          onClick={() => void copy()}
          disabled={!result.ok}
          className="rounded-md border border-[var(--border)] px-2 py-1.5 text-xs hover:bg-[var(--muted)] disabled:opacity-50"
        >
          {copied ? '已复制' : '复制'}
        </button>
        {onClose !== undefined && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-[var(--border)] px-2 py-1.5 text-xs hover:bg-[var(--muted)]"
          >
            关闭
          </button>
        )}
      </form>

      <p
        role="status"
        className={
          hasInput && !result.ok
            ? 'mt-2 font-mono text-sm text-red-400'
            : 'mt-2 font-mono text-sm text-[var(--foreground)]'
        }
      >
        {display}
      </p>
      <p className="mt-1 text-xs text-[var(--muted-foreground)]">
        支持 + - × ÷ % ^、括号、pi/e、sqrt/abs/round/floor/ceil/sin/cos/tan/ln/log/pow/min/max。完全离线，不消耗 token。
      </p>
    </div>
  )
}
