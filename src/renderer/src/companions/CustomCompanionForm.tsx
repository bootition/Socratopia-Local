import { useState, type FormEvent } from 'react'
import type { Companion } from '../../../shared/schemas/companion'
import type { CustomCompanionInput } from '../../../shared/schemas/companion'

export interface CustomCompanionFormProps {
  /** Existing companion when editing, null when creating. */
  initial?: Companion | null
  onSubmit: (input: CustomCompanionInput) => Promise<void>
  onCancel: () => void
}

const inputClass =
  'mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]'

/**
 * Create/edit form for custom companions (F34).
 *
 * Only collects the fields the prompt builder needs. The main process
 * writes a readable markdown copy next to the index; the index is the
 * authoritative source (a lost index is rebuilt from those files).
 */
export function CustomCompanionForm({
  initial = null,
  onSubmit,
  onCancel
}: CustomCompanionFormProps): React.ReactElement {
  const [name, setName] = useState(initial?.name ?? '')
  const [identity, setIdentity] = useState(initial?.identity ?? '')
  const [gender, setGender] = useState<'male' | 'female' | 'other'>(
    initial?.gender ?? 'female'
  )
  const [age, setAge] = useState(initial?.age ?? 18)
  const [keywords, setKeywords] = useState(
    initial?.personalityKeywords.join('、') ?? ''
  )
  const [personality, setPersonality] = useState(initial?.personality ?? '')
  const [speakingStyle, setSpeakingStyle] = useState(initial?.speakingStyle ?? '')
  const [emotionalExpressions, setEmotionalExpressions] = useState(
    initial?.emotionalExpressions ?? ''
  )
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()

    const parsedKeywords = keywords
      .split(/[、,，]/)
      .map((keyword) => keyword.trim())
      .filter((keyword) => keyword.length > 0)

    if (name.trim().length === 0 || identity.trim().length === 0) {
      setError('名字和身份不能为空')
      return
    }
    if (parsedKeywords.length === 0) {
      setError('至少填写一个性格关键词')
      return
    }
    if (personality.trim().length === 0) {
      setError('请写一点性格描述')
      return
    }

    setBusy(true)
    setError(null)
    try {
      await onSubmit({
        name: name.trim(),
        gender,
        age,
        identity: identity.trim(),
        personalityKeywords: parsedKeywords,
        personality: personality.trim(),
        speakingStyle: speakingStyle.trim(),
        emotionalExpressions: emotionalExpressions.trim()
      })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '保存角色失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      aria-label={initial === null ? '新建自定义角色' : '编辑自定义角色'}
      className="space-y-4 rounded-lg border border-[var(--border)] bg-[var(--card)] p-4"
    >
      <h3 className="text-sm font-semibold text-[var(--foreground)]">
        {initial === null ? '新建自定义角色' : `编辑 ${initial.name}`}
      </h3>

      {error !== null && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="cc-name" className="text-sm text-[var(--foreground)]">
            名字
          </label>
          <input
            id="cc-name"
            className={inputClass}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div>
          <label htmlFor="cc-identity" className="text-sm text-[var(--foreground)]">
            身份
          </label>
          <input
            id="cc-identity"
            className={inputClass}
            value={identity}
            onChange={(event) => setIdentity(event.target.value)}
          />
        </div>
        <div>
          <label htmlFor="cc-gender" className="text-sm text-[var(--foreground)]">
            性别
          </label>
          <select
            id="cc-gender"
            className={inputClass}
            value={gender}
            onChange={(event) =>
              setGender(event.target.value as 'male' | 'female' | 'other')
            }
          >
            <option value="female">女</option>
            <option value="male">男</option>
            <option value="other">其他</option>
          </select>
        </div>
        <div>
          <label htmlFor="cc-age" className="text-sm text-[var(--foreground)]">
            年龄
          </label>
          <input
            id="cc-age"
            type="number"
            min={0}
            max={999}
            className={inputClass}
            value={age}
            onChange={(event) => setAge(Number(event.target.value) || 0)}
          />
        </div>
      </div>

      <div>
        <label htmlFor="cc-keywords" className="text-sm text-[var(--foreground)]">
          性格关键词（用、或逗号分隔）
        </label>
        <input
          id="cc-keywords"
          className={inputClass}
          value={keywords}
          onChange={(event) => setKeywords(event.target.value)}
        />
      </div>

      <div>
        <label htmlFor="cc-personality" className="text-sm text-[var(--foreground)]">
          性格详写
        </label>
        <textarea
          id="cc-personality"
          rows={3}
          className={inputClass}
          value={personality}
          onChange={(event) => setPersonality(event.target.value)}
        />
      </div>

      <div>
        <label htmlFor="cc-style" className="text-sm text-[var(--foreground)]">
          说话风格（可选）
        </label>
        <textarea
          id="cc-style"
          rows={2}
          className={inputClass}
          value={speakingStyle}
          onChange={(event) => setSpeakingStyle(event.target.value)}
        />
      </div>

      <div>
        <label htmlFor="cc-emotions" className="text-sm text-[var(--foreground)]">
          情绪表现（可选）
        </label>
        <textarea
          id="cc-emotions"
          rows={2}
          className={inputClass}
          value={emotionalExpressions}
          onChange={(event) => setEmotionalExpressions(event.target.value)}
        />
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-[var(--primary-foreground)] disabled:opacity-50"
        >
          {busy ? '保存中…' : initial === null ? '创建角色' : '保存修改'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--muted)]"
        >
          取消
        </button>
      </div>
    </form>
  )
}
