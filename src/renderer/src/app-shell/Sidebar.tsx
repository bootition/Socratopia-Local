import type React from 'react'

export type AppSection =
  | 'settings'
  | 'companion'
  | 'textbook'
  | 'classroom'
  | 'history'
  | 'notes'
  | 'stats'
  | 'help'
  | 'progress'

const sections: ReadonlyArray<{ id: AppSection; label: string }> = [
  { id: 'settings', label: 'Settings' },
  { id: 'companion', label: 'Companion' },
  { id: 'textbook', label: 'Textbook' },
  { id: 'classroom', label: 'Classroom' },
  { id: 'history', label: 'History' },
  { id: 'notes', label: 'Notes' },
  { id: 'stats', label: 'Stats' },
  { id: 'help', label: 'Help' },
  { id: 'progress', label: 'Progress' }
]

export interface SidebarProps {
  /** Currently visible section (defaults to classroom). */
  active?: AppSection
  onNavigate?: (section: AppSection) => void
  /** Selected companion name shown in the status footer. */
  companionLabel?: string | null
  /** Selected textbook title shown in the status footer. */
  textbookLabel?: string | null
}

export function Sidebar({
  active = 'classroom',
  onNavigate,
  companionLabel = null,
  textbookLabel = null
}: SidebarProps): React.ReactElement {
  return (
    <aside className="flex h-full w-56 flex-shrink-0 flex-col border-r border-[var(--border)] bg-[var(--card)]">
      {/* App title */}
      <div className="flex h-14 items-center border-b border-[var(--border)] px-4">
        <h1 className="text-lg font-semibold tracking-tight text-[var(--foreground)]">
          Socratopia
        </h1>
      </div>

      {/* Navigation sections */}
      <nav aria-label="Classroom sections" className="flex-1 overflow-y-auto py-2">
        <ul className="space-y-1 px-2">
          {sections.map((section) => {
            const isActive = section.id === active
            return (
              <li key={section.id}>
                <button
                  type="button"
                  onClick={() => onNavigate?.(section.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={
                    isActive
                      ? 'w-full rounded-md bg-[var(--muted)] px-3 py-2 text-left text-sm font-medium text-[var(--foreground)]'
                      : 'w-full rounded-md px-3 py-2 text-left text-sm font-medium text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]'
                  }
                >
                  {section.label}
                </button>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Current classroom status */}
      <div className="space-y-1 border-t border-[var(--border)] p-3">
        <p className="text-xs text-[var(--muted-foreground)]">
          同伴：{companionLabel ?? '未选择'}
        </p>
        <p className="text-xs text-[var(--muted-foreground)]">
          教材：{textbookLabel ?? '未选择'}
        </p>
        <p className="pt-1 text-xs text-[var(--muted-foreground)]">
          Ctrl/Cmd+1…9 切换 · Ctrl/Cmd+K 搜索
        </p>
        <p className="text-xs text-[var(--muted-foreground)]">
          Socratopia-Local
        </p>
      </div>
    </aside>
  )
}
