import type { ReactElement } from 'react'
import type { Companion } from '../../../shared/schemas/companion'

export interface CompanionCardProps {
  /** Companion metadata loaded from `window.socratopia.companions.list()` */
  companion: Companion
  /** Whether this companion is the currently selected one */
  selected: boolean
  /** Called with the companion id when the card is activated */
  onSelect: (companionId: string) => void
}

/**
 * A single selectable companion tile.
 *
 * The card is a real `<button>`: keyboard users can Tab to it and
 * activate it with Enter/Space, and `aria-pressed` exposes the
 * selection state to assistive technology.
 *
 * Only list-phase metadata (name, identity, keywords) is rendered —
 * the companion markdown is never fetched here.
 */
export function CompanionCard({
  companion,
  selected,
  onSelect
}: CompanionCardProps): ReactElement {
  const keywords = companion.personalityKeywords.slice(0, 3)

  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onSelect(companion.id)}
      className={[
        'flex h-full w-full flex-col gap-2 rounded-lg border p-4 text-left transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]',
        selected
          ? 'border-[var(--primary)] bg-[var(--muted)]'
          : 'border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)]'
      ].join(' ')}
    >
      <span className="flex items-start justify-between gap-2">
        <span className="text-base font-semibold tracking-tight text-[var(--foreground)]">
          {companion.name}
        </span>
        {selected ? (
          <span className="rounded-full border border-[var(--primary)] px-2 py-0.5 text-[10px] font-medium text-[var(--primary)]">
            已选中
          </span>
        ) : null}
      </span>

      <span className="text-sm leading-snug text-[var(--muted-foreground)]">
        {companion.identity}
      </span>

      <span className="mt-auto flex flex-wrap gap-1.5 pt-2">
        {keywords.map((keyword) => (
          <span
            key={keyword}
            className="rounded-full border border-[var(--border)] bg-[var(--muted)] px-2 py-0.5 text-xs text-[var(--muted-foreground)]"
          >
            {keyword}
          </span>
        ))}
      </span>
    </button>
  )
}
