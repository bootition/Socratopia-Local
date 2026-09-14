import { useEffect, useState, type ReactNode } from 'react'
import { Sidebar, type AppSection } from './Sidebar'
import { useClassroom } from '../context/ClassroomContext'
import { CompanionSelector } from '../companions/CompanionSelector'
import { TextbookImporter } from '../textbooks/TextbookImporter'
import { TextbookLibrary } from '../textbooks/TextbookLibrary'
import { ChatPanel } from '../chat/ChatPanel'
import { SettingsPanel } from '../settings/SettingsPanel'
import { HistoryPanel } from '../history/HistoryPanel'
import { StatsPanel } from '../stats/StatsPanel'
import { NotesPanel } from '../notes/NotesPanel'
import { HelpPanel } from '../help/HelpPanel'
import { ProgressPanel } from '../progress/ProgressPanel'
import type { Companion } from '../../../shared/schemas/companion'
import type { Conversation } from '../../../shared/schemas/conversation'
import type { TextbookMetadata } from '../../../shared/schemas/textbook'
import {
  DEFAULT_PREFERENCES,
  type AppPreferences
} from '../../../shared/schemas/preferences'

export interface AppShellProps {
  children?: ReactNode
}

/**
 * Classroom workspace: sidebar navigation plus one active section
 * (Settings / Companion / Textbook / Classroom).
 *
 * When the preload bridge is unavailable (e.g. component-level tests)
 * the shell degrades to rendering `children` only.
 */
export function AppShell({ children }: AppShellProps): React.ReactElement {
  const [active, setActive] = useState<AppSection>('classroom')
  const [preferences, setPreferences] = useState<AppPreferences>(DEFAULT_PREFERENCES)
  const [companions, setCompanions] = useState<Companion[]>([])
  const [textbookMeta, setTextbookMeta] = useState<TextbookMetadata | null>(null)
  const [libraryVersion, setLibraryVersion] = useState(0)
  const { companionId, textbookId, setCompanionId, setTextbookId, setConversationId } =
    useClassroom()

  const api = typeof window !== 'undefined' ? window.socratopia : undefined

  // Load preferences once the bridge is available.
  useEffect(() => {
    if (api === undefined) return
    let cancelled = false
    api.settings
      .getPreferences()
      .then((loaded) => {
        if (!cancelled) setPreferences(loaded)
      })
      .catch(() => {
        // Keep defaults when preferences cannot be read.
      })
    return () => {
      cancelled = true
    }
  }, [api])

  // Companion metadata is needed for the status footer and chat header.
  useEffect(() => {
    if (api === undefined) return
    let cancelled = false
    api.companions
      .list()
      .then((loaded) => {
        if (!cancelled) setCompanions(loaded)
      })
      .catch(() => {
        // The selector itself surfaces load errors.
      })
    return () => {
      cancelled = true
    }
  }, [api])

  // A newly created custom companion is selected immediately by the
  // selector, so refresh the snapshot whenever the active id is unknown
  // (covers both "created just now" and "deleted elsewhere").
  useEffect(() => {
    if (api === undefined || companionId === null) return
    if (companions.some((companion) => companion.id === companionId)) return
    let cancelled = false
    api.companions
      .list()
      .then((loaded) => {
        if (!cancelled) setCompanions(loaded)
      })
      .catch(() => {
        // Keep the stale snapshot; chat will surface a clear error.
      })
    return () => {
      cancelled = true
    }
  }, [api, companionId, companions])

  // Resolve the selected textbook metadata (footer label + reading window).
  useEffect(() => {
    if (api === undefined || textbookId === null) {
      setTextbookMeta(null)
      return
    }
    let cancelled = false
    api.textbooks
      .list()
      .then((list) => {
        if (!cancelled) {
          setTextbookMeta(list.find((t) => t.id === textbookId) ?? null)
        }
      })
      .catch(() => {
        if (!cancelled) setTextbookMeta(null)
      })
    return () => {
      cancelled = true
    }
  }, [api, textbookId])

  // Keyboard shortcuts (F30): Ctrl/Cmd+1..6 switch sections, Ctrl/Cmd+K
  // jumps to history search. Modifier combos work even while typing.
  useEffect(() => {
    const byKey: Record<string, AppSection> = {
      '1': 'settings',
      '2': 'companion',
      '3': 'textbook',
      '4': 'classroom',
      '5': 'history',
      '6': 'notes',
      '7': 'stats',
      '8': 'help',
      '9': 'progress'
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return

      if (event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setActive('history')
        return
      }

      const section = byKey[event.key]
      if (section !== undefined) {
        event.preventDefault()
        setActive(section)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Apply the stored theme and reading size to the document root.
  useEffect(() => {
    document.documentElement.classList.toggle('dark', preferences.theme === 'dark')
  }, [preferences.theme])

  useEffect(() => {
    const scale = { small: '14px', normal: '16px', large: '18px' }[preferences.fontScale]
    document.documentElement.style.fontSize = scale
  }, [preferences.fontScale])

  const selectedCompanion =
    companions.find((companion) => companion.id === companionId) ?? null

  function renderSection(): React.ReactElement {
    switch (active) {
      case 'settings':
        return <SettingsPanel preferences={preferences} onChange={setPreferences} />
      case 'companion':
        return <CompanionSelector />
      case 'textbook':
        return (
          <div className="flex h-full flex-col overflow-y-auto">
            <TextbookLibrary refreshToken={libraryVersion} />
            <TextbookImporter
              onImported={() => setLibraryVersion((v) => v + 1)}
              onGoToClassroom={() => setActive('classroom')}
            />
          </div>
        )
      case 'history':
        return <HistoryPanel onOpenConversation={handleOpenConversation} />
      case 'notes':
        return <NotesPanel />
      case 'stats':
        return <StatsPanel />
      case 'help':
        return <HelpPanel />
      case 'progress':
        return (
          <ProgressPanel
            onContinue={handleContinueTextbook}
            onOpenConversation={handleOpenConversation}
          />
        )
      case 'classroom':
        return (
          <>
            {companionId === null && (
              <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--muted)] px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-[var(--foreground)]">
                    开始第一节课
                  </p>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    1. 选择同伴 · 2. 导入教材 · 3. 提问，同伴会用追问陪你学
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => setActive('companion')}
                    className="rounded border border-[var(--border)] px-2 py-1 text-xs hover:bg-[var(--card)]"
                  >
                    选择同伴
                  </button>
                  <button
                    type="button"
                    onClick={() => setActive('textbook')}
                    className="rounded border border-[var(--border)] px-2 py-1 text-xs hover:bg-[var(--card)]"
                  >
                    导入教材
                  </button>
                </div>
              </div>
            )}
            <ChatPanel
              companionId={companionId}
              companionName={selectedCompanion?.name ?? null}
              textbookId={textbookId}
              textbookMeta={textbookMeta}
              preferences={preferences}
            />
          </>
        )
    }
  }

  /** Select a textbook and jump back into the classroom. */
  function handleContinueTextbook(textbook: { id: string }): void {
    setTextbookId(textbook.id)
    setActive('classroom')
  }

  /** Restore a past conversation and jump back into the classroom. */
  function handleOpenConversation(conversation: Conversation): void {
    // If the companion was deleted, open the lesson read-only (no
    // companion selected) instead of failing every send with
    // "Companion not found". The textbook may equally be gone; the
    // main process degrades that to a lesson without grounding.
    const companionStillExists = companions.some(
      (companion) => companion.id === conversation.companionId
    )
    setCompanionId(companionStillExists ? conversation.companionId : null)
    setTextbookId(conversation.textbookId)
    setConversationId(conversation.id)
    setActive('classroom')
  }

  return (
    <div className="flex h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Sidebar
        active={active}
        onNavigate={setActive}
        companionLabel={selectedCompanion?.name ?? null}
        textbookLabel={textbookMeta?.title ?? null}
      />

      <main
        className="flex flex-1 flex-col overflow-hidden"
        aria-label="Classroom workspace"
      >
        {api === undefined ? (
          <div className="flex flex-1 flex-col overflow-y-auto p-6">{children}</div>
        ) : (
          <div className="flex flex-1 flex-col overflow-hidden">{renderSection()}</div>
        )}
      </main>
    </div>
  )
}
