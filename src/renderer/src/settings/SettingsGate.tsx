import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode
} from 'react'
import type { DeepSeekKeyTestResult } from '../../../shared/schemas/settings'
import { toUserMessage } from '../lib/user-message'

// ---------------------------------------------------------------
// Settings context — exposes key state to the shell once ready
// ---------------------------------------------------------------

export interface SettingsContextValue {
  /** Whether a usable DeepSeek API key is configured */
  hasKey: boolean
  /** Remove the stored key and return to the setup gate */
  deleteKey: () => Promise<void>
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

/**
 * Access the API-key state from inside the app shell.
 * Must be used within a mounted {@link SettingsGate} that has a key.
 */
export function useSettings(): SettingsContextValue {
  const value = useContext(SettingsContext)
  if (value === null) {
    throw new Error('useSettings must be used within a configured SettingsGate')
  }
  return value
}

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

export interface SettingsGateProps {
  children: ReactNode
}

type GateStatus = 'checking' | 'missing' | 'configured'

/**
 * First-run gate around the whole app.
 *
 * - While the key state is loading, shows a small status screen.
 * - Without a key, shows the setup form and nothing else.
 * - With a key, renders children inside a {@link SettingsContext}.
 */
export function SettingsGate({ children }: SettingsGateProps): React.ReactElement {
  const [status, setStatus] = useState<GateStatus>('checking')
  const [keyInput, setKeyInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<DeepSeekKeyTestResult | null>(null)

  useEffect(() => {
    let cancelled = false

    window.socratopia.settings
      .hasDeepSeekKey()
      .then((hasKey) => {
        if (!cancelled) {
          setStatus(hasKey ? 'configured' : 'missing')
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStatus('missing')
          setError('无法读取 Key 状态，请重新输入 API Key')
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  const handleSave = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const key = keyInput.trim()

      if (key.length === 0) {
        setError('请输入 API Key')
        return
      }

      setSaving(true)
      setError(null)
      try {
        await window.socratopia.settings.setDeepSeekKey(key)
        // Only keep the plaintext in state until the save resolves.
        setKeyInput('')
        setStatus('configured')
      } catch (err) {
        setError(toUserMessage(err, '保存 API Key 失败'))
      } finally {
        setSaving(false)
      }
    },
    [keyInput]
  )

  const handleTest = useCallback(async () => {
    const key = keyInput.trim()
    if (key.length === 0) {
      setError('请先输入 API Key')
      return
    }

    setTesting(true)
    setError(null)
    setTestResult(null)
    try {
      const result = await window.socratopia.settings.testDeepSeekKey(key)
      setTestResult(result)
    } catch (err: unknown) {
      setTestResult({
        ok: false,
        message: toUserMessage(err, '测试连接失败')
      })
    } finally {
      setTesting(false)
    }
  }, [keyInput])

  const handleDeleteKey = useCallback(async () => {
    await window.socratopia.settings.deleteDeepSeekKey()
    setKeyInput('')
    setError(null)
    setStatus('missing')
  }, [])

  if (status === 'checking') {
    return (
      <div
        className="flex h-screen items-center justify-center bg-[var(--background)] text-sm text-[var(--muted-foreground)]"
        role="status"
      >
        正在检查配置…
      </div>
    )
  }

  if (status === 'missing') {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--background)] p-6">
        <form
          onSubmit={handleSave}
          className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-lg"
        >
          <h1 className="text-lg font-semibold text-[var(--foreground)]">
            配置 DeepSeek API Key
          </h1>
          <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
            Socratopia-Local 使用你自己的 DeepSeek API Key，费用由你的账户承担。
            Key 只会加密保存在本机，不会发送到任何第三方服务。
          </p>

          <ol className="mt-3 list-decimal space-y-1 pl-5 text-xs leading-5 text-[var(--muted-foreground)]">
            <li>到 DeepSeek 开放平台创建一个 API Key（下方链接）。</li>
            <li>粘贴到下面，先点「测试连接（不保存）」确认 Key / 网络 / 模型可用。</li>
            <li>保存后导入教材（Markdown / 文本 / PDF / EPUB / Word），选同伴开始上课。</li>
          </ol>

          <a
            href="https://platform.deepseek.com/api_keys"
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-block text-xs text-[var(--primary)] underline underline-offset-2"
          >
            还没有 Key？前往 DeepSeek 开放平台创建 →
          </a>

          <label
            htmlFor="deepseek-api-key"
            className="mt-5 block text-sm font-medium text-[var(--foreground)]"
          >
            API Key
          </label>
          <input
            id="deepseek-api-key"
            name="deepseek-api-key"
            type="password"
            autoComplete="off"
            value={keyInput}
            onChange={(event) => setKeyInput(event.target.value)}
            placeholder="sk-..."
            className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
          />

          {error !== null && (
            <p role="alert" className="mt-2 text-sm text-red-400">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="mt-5 w-full rounded-md bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? '保存中…' : '保存并进入课堂'}
          </button>

          <button
            type="button"
            onClick={() => void handleTest()}
            disabled={testing || saving}
            className="mt-3 w-full rounded-md border border-[var(--border)] px-4 py-2 text-sm text-[var(--foreground)] transition-colors hover:bg-[var(--muted)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {testing ? '测试中…' : '测试连接（不保存）'}
          </button>

          {testResult !== null && (
            <p
              role={testResult.ok ? 'status' : 'alert'}
              className={
                testResult.ok
                  ? 'mt-2 text-sm text-emerald-400'
                  : 'mt-2 text-sm text-red-400'
              }
            >
              {testResult.ok
                ? `连接成功：模型 ${testResult.model ?? '未知'} 已响应`
                : `连接失败：${testResult.message ?? '未知错误'}`}
            </p>
          )}
        </form>
      </div>
    )
  }

  return (
    <SettingsContext.Provider value={{ hasKey: true, deleteKey: handleDeleteKey }}>
      {children}
    </SettingsContext.Provider>
  )
}
