import { useCallback, useEffect, useState, type ReactElement } from 'react'

import { toUserMessage } from '../lib/user-message'
import type { Companion } from '../../../shared/schemas/companion'
import { useClassroom, type ClassroomContextValue } from '../context/ClassroomContext'
import { CompanionCard } from './CompanionCard'
import { CustomCompanionForm } from './CustomCompanionForm'
import type { CustomCompanionInput } from '../../../shared/schemas/companion'

export interface CompanionSelectorProps {
  /**
   * Controlled selected companion id. When omitted, the value from
   * `ClassroomContext` is used.
   */
  selectedId?: string | null
  /**
   * Called with the clicked companion id. When omitted,
   * `ClassroomContext.setCompanionId` is used.
   */
  onSelect?: (companionId: string) => void
  /** Optional extra classes for the section wrapper */
  className?: string
}

type LoadStatus = 'loading' | 'ready' | 'error'

/**
 * Read the classroom context when the selector is rendered inside a
 * `ClassroomProvider`, and fall back to prop-only usage otherwise.
 * `useClassroom` is still called unconditionally on every render, so
 * the hook order stays stable.
 */
function useOptionalClassroom(): ClassroomContextValue | null {
  try {
    return useClassroom()
  } catch {
    return null
  }
}

/**
 * Companion selector for the classroom.
 *
 * Loads companion metadata once with `window.socratopia.companions.list()`,
 * renders every companion as a keyboard-operable card, and reports the
 * selection through `onSelect` (or `ClassroomContext.setCompanionId`).
 *
 * The list phase uses metadata only; `companions.get()` (which reads the
 * companion markdown) is never called here.
 */
export function CompanionSelector({
  selectedId,
  onSelect,
  className
}: CompanionSelectorProps): ReactElement {
  const classroom = useOptionalClassroom()

  const [companions, setCompanions] = useState<Companion[]>([])
  const [status, setStatus] = useState<LoadStatus>('loading')
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [formMode, setFormMode] = useState<
    { type: 'create' } | { type: 'edit'; companion: Companion } | null
  >(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let cancelled = false

    setStatus('loading')
    setError(null)

    window.socratopia.companions
      .list()
      .then((result) => {
        if (cancelled) return
        setCompanions(result)
        setStatus('ready')
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(toUserMessage(err, String(err)))
        setStatus('error')
      })

    return () => {
      cancelled = true
    }
  }, [attempt])

  const activeId =
    selectedId !== undefined ? selectedId : (classroom?.companionId ?? null)

  const refresh = useCallback(() => {
    setAttempt((value) => value + 1)
  }, [reloadToken])

  const handleCreate = useCallback(
    async (input: CustomCompanionInput) => {
      await window.socratopia.companions.createCustom(input)
      setFormMode(null)
      refresh()
    },
    [refresh]
  )

  const handleUpdate = useCallback(
    async (companionId: string, input: CustomCompanionInput) => {
      await window.socratopia.companions.updateCustom(companionId, input)
      setFormMode(null)
      refresh()
    },
    [refresh]
  )

  const handleDelete = useCallback(
    async (companion: Companion) => {
      const confirmed = window.confirm(
        `删除自定义角色「${companion.name}」？已上过的课堂记录会保留。`
      )
      if (!confirmed) return
      try {
        await window.socratopia.companions.deleteCustom(companion.id)
        if (activeId === companion.id) {
          classroom?.setCompanionId(null)
        }
        refresh()
      } catch (err: unknown) {
        setFormError(err instanceof Error ? err.message : '删除角色失败')
      }
    },
    [activeId, classroom, refresh]
  )

  const handleSelect = useCallback(
    (companionId: string) => {
      if (onSelect !== undefined) {
        onSelect(companionId)
        return
      }
      if (classroom === null) return

      // Switching the companion mid-lesson would mix two characters and
      // leave conversation.json pointing at the old one, so start a new
      // conversation; the old lesson stays available in History.
      if (
        classroom.companionId !== companionId &&
        classroom.conversationId !== null
      ) {
        classroom.setConversationId(null)
      }
      classroom.setCompanionId(companionId)
    },
    [classroom, onSelect]
  )

  return (
    <section
      aria-labelledby="companion-selector-heading"
      className={['space-y-4', className].filter(Boolean).join(' ')}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h2
            id="companion-selector-heading"
            className="text-lg font-semibold tracking-tight text-[var(--foreground)]"
          >
            选择同伴
          </h2>
          <p className="text-sm text-[var(--muted-foreground)]">
            选择一位同伴一起上课，之后可以随时更换；也可以创建自己的角色。
          </p>
        </div>
        {formMode === null && (
          <button
            type="button"
            onClick={() => {
              setFormError(null)
              setFormMode({ type: 'create' })
            }}
            className="shrink-0 rounded-md border border-[var(--border)] px-3 py-1.5 text-xs hover:bg-[var(--muted)]"
          >
            新建自定义角色
          </button>
        )}
      </header>

      {formError !== null && (
        <p role="alert" className="text-sm text-red-400">
          {formError}
        </p>
      )}

      {formMode !== null && (
        <CustomCompanionForm
          key={formMode.type === 'edit' ? formMode.companion.id : 'new'}
          initial={formMode.type === 'edit' ? formMode.companion : null}
          onSubmit={(input) =>
            formMode.type === 'edit'
              ? handleUpdate(formMode.companion.id, input)
              : handleCreate(input)
          }
          onCancel={() => setFormMode(null)}
        />
      )}

      {status === 'loading' ? (
        <div
          role="status"
          className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6 text-sm text-[var(--muted-foreground)]"
        >
          正在加载同伴列表…
        </div>
      ) : null}

      {status === 'error' ? (
        <div
          role="alert"
          className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--card)] p-6"
        >
          <div className="space-y-1">
            <p className="text-sm font-medium text-[var(--foreground)]">
              无法加载同伴列表
            </p>
            {error !== null ? (
              <p className="text-xs text-[var(--muted-foreground)]">{error}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setAttempt((value) => value + 1)}
            className="rounded-md border border-[var(--border)] bg-[var(--muted)] px-3 py-1.5 text-sm font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--card)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
          >
            重试
          </button>
        </div>
      ) : null}

      {status === 'ready' && companions.length === 0 ? (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6 text-sm text-[var(--muted-foreground)]">
          <p>没有找到可用的同伴。可以重试读取，或新建一个自定义角色。</p>
          <button
            type="button"
            onClick={() => setReloadToken((value) => value + 1)}
            className="mt-2 rounded-md border border-[var(--border)] px-3 py-1.5 text-xs hover:bg-[var(--muted)]"
          >
            重试
          </button>
        </div>
      ) : null}

      {status === 'ready' && companions.length > 0 ? (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {companions.map((companion) => (
            <li key={companion.id} className="flex flex-col gap-1">
              <CompanionCard
                companion={companion}
                selected={companion.id === activeId}
                onSelect={handleSelect}
              />
              {companion.source === 'custom' && (
                <div className="flex gap-2 px-1">
                  <button
                    type="button"
                    onClick={() => {
                      setFormError(null)
                      setFormMode({ type: 'edit', companion })
                    }}
                    className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                  >
                    编辑
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(companion)}
                    className="text-xs text-red-300 hover:text-red-200"
                  >
                    删除
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
