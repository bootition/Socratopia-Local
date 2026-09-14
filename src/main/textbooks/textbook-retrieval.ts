/**
 * Keyword retrieval over textbook segments (F02, local-only).
 *
 * No embeddings and no network: CJK text is scored with character
 * bigrams and Latin text with words. Good enough to find the paragraph
 * a learner is asking about, and every hit is verifiable in the
 * original file because segments keep their verbatim text.
 */

import type { MessageSource } from '../../shared/schemas/message'
import type { TextbookSegment } from './textbook-index'

export interface RetrievedSegment extends MessageSource {
  /** 1-based segment ordinal inside the textbook (for [教材#N] markers). */
  index: number
  /** Retrieval score (higher is better). */
  score: number
}

/** Extract query terms: Latin words + CJK bigrams. */
export function extractTerms(query: string): string[] {
  const terms = new Set<string>()
  const normalized = query.toLowerCase()

  for (const word of normalized.match(/[a-z0-9][a-z0-9_+-]*/g) ?? []) {
    if (word.length >= 2) terms.add(word)
  }

  for (const run of normalized.match(/[\u3400-\u9fff]+/g) ?? []) {
    if (run.length === 1) {
      terms.add(run)
      continue
    }
    for (let i = 0; i < run.length - 1; i++) {
      terms.add(run.slice(i, i + 2))
    }
  }

  return [...terms]
}

function scoreSegment(segment: TextbookSegment, terms: string[]): number {
  const haystack = `${segment.heading}\n${segment.text}`.toLowerCase()
  let score = 0
  for (const term of terms) {
    let from = 0
    while (true) {
      const at = haystack.indexOf(term, from)
      if (at === -1) break
      score += 1
      from = at + term.length
    }
  }
  return score
}

/**
 * Return the best matching segments for a query.
 *
 * @param limit maximum number of sources (default 3)
 * @returns matches with score > 0, best first; ties keep document order.
 */
export function retrieveSegments(
  segments: TextbookSegment[],
  query: string,
  limit = 3
): RetrievedSegment[] {
  const terms = extractTerms(query)
  if (terms.length === 0) return []

  const scored = segments
    .map((segment, position) => ({
      segment,
      position,
      score: scoreSegment(segment, terms)
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.position - b.position)
    .slice(0, Math.max(1, limit))

  return scored.map((entry) => ({
    segmentId: entry.segment.segmentId,
    index: entry.segment.index,
    label: entry.segment.label,
    text: entry.segment.text,
    score: entry.score
  }))
}
