import { useEffect, useState } from 'react'
import type { UsageSummary } from '../../../shared/schemas/usage'
import {
  DEFAULT_PREFERENCES,
  type AppPreferences
} from '../../../shared/schemas/preferences'

function formatNumber(value: number): string {
  return value.toLocaleString('zh-CN')
}

function formatCost(value: number): string {
  return value.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4
  })
}

/**
 * Local usage & cost statistics (F15).
 *
 * Token counts come from the local `usage.jsonl` log; the cost estimate
 * uses the per-million rates the user sets in Settings, so it can match
 * whatever DeepSeek currently charges (0 disables the estimate).
 */
export function StatsPanel(): React.ReactElement {
  const [summary, setSummary] = useState<UsageSummary | null>(null)
  const [preferences, setPreferences] = useState<AppPreferences>(DEFAULT_PREFERENCES)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      window.socratopia.stats.get(),
      window.socratopia.settings.getPreferences()
    ])
      .then(([usage, prefs]) => {
        if (!cancelled) {
          setSummary(usage)
          setPreferences(prefs)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '无法读取用量统计')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const hasRates =
    preferences.pricePerMillionInput > 0 || preferences.pricePerMillionOutput > 0
  const estimatedCost =
    summary === null
      ? 0
      : (summary.promptTokens / 1_000_000) * preferences.pricePerMillionInput +
        (summary.completionTokens / 1_000_000) * preferences.pricePerMillionOutput

  return (
    <section aria-label="用量统计" className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <div>
        <h2 className="text-lg font-semibold text-[var(--foreground)]">用量与费用</h2>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          记录只保存在本机（config/usage.jsonl），直连 DeepSeek 的 token 消耗一目了然。
        </p>
      </div>

      {loading && (
        <p role="status" className="text-sm text-[var(--muted-foreground)]">
          正在读取用量记录…
        </p>
      )}

      {error !== null && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}

      {summary !== null && summary.calls === 0 && (
        <p className="text-sm text-[var(--muted-foreground)]">
          还没有用量记录，上完一节课后这里会显示 token 与估算费用。
        </p>
      )}

      {summary !== null && summary.calls > 0 && (
        <>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-3">
              <dt className="text-xs text-[var(--muted-foreground)]">总 token</dt>
              <dd className="text-lg font-semibold text-[var(--foreground)]">
                {formatNumber(summary.totalTokens)}
              </dd>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-3">
              <dt className="text-xs text-[var(--muted-foreground)]">输入</dt>
              <dd className="text-lg font-semibold text-[var(--foreground)]">
                {formatNumber(summary.promptTokens)}
              </dd>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-3">
              <dt className="text-xs text-[var(--muted-foreground)]">输出</dt>
              <dd className="text-lg font-semibold text-[var(--foreground)]">
                {formatNumber(summary.completionTokens)}
              </dd>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-3">
              <dt className="text-xs text-[var(--muted-foreground)]">请求数</dt>
              <dd className="text-lg font-semibold text-[var(--foreground)]">
                {formatNumber(summary.calls)}
              </dd>
            </div>
          </dl>

          <p className="text-sm text-[var(--muted-foreground)]">
            估算费用：
            {hasRates ? (
              <span className="text-[var(--foreground)]">
                {formatCost(estimatedCost)}（按设置中的单价）
              </span>
            ) : (
              <span>在 Settings 中填写每百万 token 单价后显示</span>
            )}
          </p>

          <div>
            <h3 className="text-sm font-semibold text-[var(--foreground)]">按日期</h3>
            <table className="mt-2 w-full border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs text-[var(--muted-foreground)]">
                  <th className="border-b border-[var(--border)] py-1">日期</th>
                  <th className="border-b border-[var(--border)] py-1">输入</th>
                  <th className="border-b border-[var(--border)] py-1">输出</th>
                  <th className="border-b border-[var(--border)] py-1">合计</th>
                  <th className="border-b border-[var(--border)] py-1">请求</th>
                </tr>
              </thead>
              <tbody>
                {summary.days.map((day) => (
                  <tr key={day.date} className="text-[var(--foreground)]">
                    <td className="py-1">{day.date}</td>
                    <td className="py-1">{formatNumber(day.promptTokens)}</td>
                    <td className="py-1">{formatNumber(day.completionTokens)}</td>
                    <td className="py-1">{formatNumber(day.totalTokens)}</td>
                    <td className="py-1">{day.calls}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-[var(--foreground)]">按模型</h3>
            <ul className="mt-2 space-y-1 text-sm text-[var(--foreground)]">
              {summary.models.map((model) => (
                <li key={model.model} className="flex justify-between">
                  <span>{model.model}</span>
                  <span className="text-[var(--muted-foreground)]">
                    {formatNumber(model.totalTokens)} tokens · {model.calls} 次
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </section>
  )
}
