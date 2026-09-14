import { useEffect, useState } from 'react'
import { useSettings } from './SettingsGate'
import {
  ChatModel,
  FontScale,
  ReasoningEffort,
  TeachingPace,
  ThemeMode,
  type AppPreferences,
  type AppPreferencesPatch
} from '../../../shared/schemas/preferences'
import { toUserMessage } from '../lib/user-message'

/**
 * Price input keeps a local string while typing so "1." / "0.28" do not
 * get swallowed by React re-rendering a numeric value; the parsed number
 * is committed on blur.
 */
function PriceField({
  id,
  label,
  value,
  onCommit
}: {
  id: string
  label: string
  value: number
  onCommit: (value: number) => void
}): React.ReactElement {
  const [text, setText] = useState(String(value))

  useEffect(() => {
    setText(String(value))
  }, [value])

  function commit(): void {
    const parsed = Number.parseFloat(text.replace(/[^\d.]/g, ''))
    const next = Number.isFinite(parsed)
      ? Math.min(Math.max(parsed, 0), 100000)
      : 0
    setText(String(next))
    if (next !== value) onCommit(next)
  }

  return (
    <div>
      <label htmlFor={id} className="text-sm text-[var(--foreground)]">
        {label}
      </label>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        className={fieldClass}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
      />
    </div>
  )
}

export interface SettingsPanelProps {
  preferences: AppPreferences
  onChange: (preferences: AppPreferences) => void
}

const fieldClass =
  'mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]'

/**
 * Settings & preferences panel (F08/F09/F01/F18):
 * - DeepSeek model + thinking effort (cost/latency control)
 * - teaching pace and narration toggle (prompt behaviour)
 * - Enter-key preference and theme
 * - API key removal
 */
export function SettingsPanel({
  preferences,
  onChange
}: SettingsPanelProps): React.ReactElement {
  const { deleteKey } = useSettings()
  const [status, setStatus] = useState<string | null>(null)
  const [statusIsError, setStatusIsError] = useState(false)
  const [testing, setTesting] = useState(false)
  const [keyInput, setKeyInput] = useState('')
  const [savingKey, setSavingKey] = useState(false)

  function setOk(message: string | null): void {
    setStatus(message)
    setStatusIsError(false)
  }

  function setError(message: string): void {
    setStatus(message)
    setStatusIsError(true)
  }

  async function handleSaveKey(): Promise<void> {
    const key = keyInput.trim()
    if (key.length === 0) {
      setError('请先粘贴新的 API Key')
      return
    }

    setSavingKey(true)
    try {
      await window.socratopia.settings.setDeepSeekKey(key)
      setKeyInput('')
      setOk('API Key 已更新')
    } catch (err: unknown) {
      setError(toUserMessage(err, '更换 API Key 失败'))
    } finally {
      setSavingKey(false)
    }
  }

  async function handleDeleteKey(): Promise<void> {
    const confirmed = window.confirm(
      '删除本机保存的 DeepSeek API Key？删除后需要重新填写才能继续上课。'
    )
    if (!confirmed) return
    try {
      await deleteKey()
      setOk('API Key 已删除')
    } catch (err: unknown) {
      setError(toUserMessage(err, '删除 API Key 失败'))
    }
  }

  async function handleTestConnection(): Promise<void> {
    setTesting(true)
    setOk('正在测试连接…')
    try {
      const result = await window.socratopia.settings.testDeepSeekKey()
      if (result.ok) {
        setOk(`连接成功：模型 ${result.model ?? '未知'} 已响应`)
      } else {
        setError(`连接失败：${result.message ?? '未知错误'}`)
      }
    } catch (err: unknown) {
      setError(toUserMessage(err, '测试连接失败'))
    } finally {
      setTesting(false)
    }
  }

  async function handleExportBackup(): Promise<void> {
    setOk('正在导出备份…')
    try {
      const result = await window.socratopia.archive.exportBackup()
      setOk(result === null ? '已取消' : `备份已保存到 ${result.path}`)
    } catch (err: unknown) {
      setError(toUserMessage(err, '导出备份失败'))
    }
  }

  async function handleRestoreBackup(): Promise<void> {
    const confirmed = window.confirm(
      '恢复备份会覆盖当前数据目录中的同名文件，确定继续吗？'
    )
    if (!confirmed) return
    setOk('正在恢复备份…')
    try {
      const result = await window.socratopia.archive.restoreBackup()
      setOk(result === null ? '已取消' : `已从 ${result.path} 恢复，建议重启应用`)
    } catch (err: unknown) {
      setError(toUserMessage(err, '恢复备份失败'))
    }
  }

  async function update(patch: AppPreferencesPatch): Promise<void> {
    // Optimistic UI, then persist through the main process.
    const previous = preferences
    onChange({ ...preferences, ...patch })
    setOk('保存中…')
    try {
      const saved = await window.socratopia.settings.setPreferences(patch)
      onChange(saved)
      setOk('已保存')
    } catch (err: unknown) {
      // Roll back so the UI never claims a value the disk does not have.
      try {
        const current = await window.socratopia.settings.getPreferences()
        onChange(current)
      } catch {
        onChange(previous)
      }
      setError(toUserMessage(err, '保存失败'))
    }
  }

  return (
    <section aria-labelledby="settings-heading" className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <h2 id="settings-heading" className="text-lg font-semibold text-[var(--foreground)]">
          设置
        </h2>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          所有偏好都保存在本机，随时可以修改。
        </p>
      </div>

      <div className="space-y-4 rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
        <h3 className="text-sm font-semibold text-[var(--foreground)]">模型与思考</h3>

        <div>
          <label htmlFor="pref-model" className="text-sm text-[var(--foreground)]">
            DeepSeek 模型
          </label>
          <select
            id="pref-model"
            className={fieldClass}
            value={preferences.model}
            onChange={(event) => void update({ model: event.target.value as ChatModel })}
          >
            <option value={ChatModel.Pro}>deepseek-v4-pro（推理更强）</option>
            <option value={ChatModel.Flash}>deepseek-v4-flash（更快更省）</option>
          </select>
        </div>

        <div>
          <label htmlFor="pref-effort" className="text-sm text-[var(--foreground)]">
            思考深度
          </label>
          <select
            id="pref-effort"
            className={fieldClass}
            value={preferences.reasoningEffort}
            onChange={(event) =>
              void update({ reasoningEffort: event.target.value as ReasoningEffort })
            }
          >
            <option value={ReasoningEffort.Off}>关闭思考（最省）</option>
            <option value={ReasoningEffort.Low}>low</option>
            <option value={ReasoningEffort.High}>high（默认）</option>
            <option value={ReasoningEffort.Max}>max（最深入，最慢）</option>
          </select>
        </div>
      </div>

      <div className="space-y-4 rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
        <h3 className="text-sm font-semibold text-[var(--foreground)]">教学方式</h3>

        <div>
          <label htmlFor="pref-pace" className="text-sm text-[var(--foreground)]">
            教学节奏
          </label>
          <select
            id="pref-pace"
            className={fieldClass}
            value={preferences.pace}
            onChange={(event) => void update({ pace: event.target.value as TeachingPace })}
          >
            <option value={TeachingPace.Slow}>慢慢来：一次只推进一个知识点</option>
            <option value={TeachingPace.Normal}>正常：跟随教材推进</option>
            <option value={TeachingPace.Fast}>快速：掌握后合并要点前移</option>
          </select>
        </div>

        <label className="flex items-center gap-2 text-sm text-[var(--foreground)]">
          <input
            type="checkbox"
            checked={preferences.narrationEnabled}
            onChange={(event) => void update({ narrationEnabled: event.target.checked })}
          />
          保留旁白（角色的动作/神态描写）
        </label>
      </div>

      <div className="space-y-4 rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
        <h3 className="text-sm font-semibold text-[var(--foreground)]">界面与输入</h3>

        <div>
          <label htmlFor="pref-theme" className="text-sm text-[var(--foreground)]">
            主题
          </label>
          <select
            id="pref-theme"
            className={fieldClass}
            value={preferences.theme}
            onChange={(event) => void update({ theme: event.target.value as ThemeMode })}
          >
            <option value={ThemeMode.Dark}>深色</option>
            <option value={ThemeMode.Light}>浅色</option>
          </select>
        </div>

        <div>
          <label htmlFor="pref-font-scale" className="text-sm text-[var(--foreground)]">
            正文字号
          </label>
          <select
            id="pref-font-scale"
            className={fieldClass}
            value={preferences.fontScale}
            onChange={(event) => void update({ fontScale: event.target.value as FontScale })}
          >
            <option value={FontScale.Small}>小</option>
            <option value={FontScale.Normal}>标准</option>
            <option value={FontScale.Large}>大</option>
          </select>
        </div>

        <label className="flex items-center gap-2 text-sm text-[var(--foreground)]">
          <input
            type="checkbox"
            checked={preferences.sendOnEnter}
            onChange={(event) => void update({ sendOnEnter: event.target.checked })}
          />
          Enter 发送（关闭后 Enter 换行，Ctrl/Cmd+Enter 发送）
        </label>
      </div>

      <div className="space-y-4 rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
        <h3 className="text-sm font-semibold text-[var(--foreground)]">用量与费用</h3>
        <p className="text-xs text-[var(--muted-foreground)]">
          填写 DeepSeek 当前的每百万 token 单价后，Stats 页面会显示估算费用；留 0 则只统计 token。
        </p>
        <div className="grid grid-cols-2 gap-3">
          <PriceField
            id="pref-price-input"
            label="输入单价 / 百万 token"
            value={preferences.pricePerMillionInput}
            onCommit={(value) => void update({ pricePerMillionInput: value })}
          />
          <PriceField
            id="pref-price-output"
            label="输出单价 / 百万 token"
            value={preferences.pricePerMillionOutput}
            onCommit={(value) => void update({ pricePerMillionOutput: value })}
          />
        </div>
      </div>

      <div className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
        <h3 className="text-sm font-semibold text-[var(--foreground)]">本地数据</h3>
        <p className="text-xs text-[var(--muted-foreground)]">
          课堂、教材和产物都保存在本机数据目录。备份就是复制一份目录，恢复会用备份覆盖同名文件。
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void handleExportBackup()}
            className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--muted)]"
          >
            导出备份…
          </button>
          <button
            type="button"
            onClick={() => void handleRestoreBackup()}
            className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--muted)]"
          >
            从备份恢复…
          </button>
          <button
            type="button"
            onClick={() => void window.socratopia.archive.openDataFolder()}
            className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--muted)]"
          >
            打开数据目录
          </button>
        </div>
      </div>

      <div className="space-y-3 rounded-lg border border-red-500/40 bg-red-500/5 p-4">
        <h3 className="text-sm font-semibold text-red-300">DeepSeek API Key</h3>
        <p className="text-sm text-[var(--muted-foreground)]">
          可以在这里更换或删除 Key。删除后应用会回到首次配置界面；学习数据不会被删除。
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="password"
            aria-label="新的 API Key"
            autoComplete="off"
            value={keyInput}
            onChange={(event) => setKeyInput(event.target.value)}
            placeholder="粘贴新的 sk-..."
            className="min-w-[16rem] flex-1 rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-sm text-[var(--foreground)] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
          />
          <button
            type="button"
            onClick={() => void handleSaveKey()}
            disabled={savingKey || keyInput.trim().length === 0}
            className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--muted)] disabled:opacity-50"
          >
            {savingKey ? '保存中…' : '更换 API Key'}
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void handleTestConnection()}
            disabled={testing}
            className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--muted)] disabled:opacity-50"
          >
            {testing ? '测试中…' : '测试连接'}
          </button>
          <button
            type="button"
            onClick={() => void handleDeleteKey()}
            className="rounded-md border border-red-400/50 px-3 py-1.5 text-sm text-red-300 transition-colors hover:bg-red-500/10"
          >
            删除 API Key
          </button>
        </div>
      </div>

      {status !== null && (
        <p
          role={statusIsError ? 'alert' : 'status'}
          className={
            statusIsError
              ? 'text-sm text-red-400'
              : 'text-sm text-[var(--muted-foreground)]'
          }
        >
          {status}
        </p>
      )}
    </section>
  )
}
