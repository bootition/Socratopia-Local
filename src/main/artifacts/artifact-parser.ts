/**
 * Parser for the end-class `===TAG===` protocol.
 *
 * The model is asked to answer with seven delimited sections. This
 * module is pure (no fs/LLM) so every failure mode is unit-testable:
 * missing farewell aborts the whole parse, while a missing or malformed
 * individual section is reported as failed so it can be re-run alone.
 */

import { ArtifactType } from '../../shared/types/ids'
import {
  FlashcardSchema,
  HandoffMessageSchema,
  type Flashcard,
  type HandoffMessage
} from '../../shared/schemas/artifact'

// ---------------------------------------------------------------
// Tags
// ---------------------------------------------------------------

export const END_CLASS_TAGS = {
  farewell: 'FAREWELL',
  summary: 'SUMMARY_MD',
  flashcards: 'FLASHCARDS_JSON',
  diary: 'DIARY_ENTRY',
  progress: 'PROGRESS_MD',
  handoffTail: 'HANDOFF_TAIL_JSON',
  end: 'END'
} as const

// ---------------------------------------------------------------
// Result
// ---------------------------------------------------------------

export interface ParsedEndClass {
  farewell: string
  summary: string | null
  flashcards: Flashcard[] | null
  diary: string | null
  progress: string | null
  handoffTail: HandoffMessage[] | null
  /** Artifacts that were missing or malformed in the model output. */
  failed: ArtifactType[]
}

export class EndClassParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EndClassParseError'
  }
}

// ---------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------

const TAG_LINE = /^===\s*([A-Z_]+)\s*===\s*$/gm

/** Split the raw model output into `{ TAG: content }` sections. */
export function splitEndClassSections(raw: string): Record<string, string> {
  const sections: Record<string, string> = {}
  const matches = [...raw.matchAll(TAG_LINE)]

  for (let i = 0; i < matches.length; i++) {
    const tag = matches[i][1]
    const start = (matches[i].index ?? 0) + matches[i][0].length
    const end = i + 1 < matches.length ? matches[i + 1].index ?? raw.length : raw.length
    sections[tag] = raw.slice(start, end).trim()
  }

  return sections
}

/** Remove an optional ```json ... ``` fence around a JSON section. */
function stripCodeFence(text: string): string {
  const fenced = text.match(/^```(?:json)?\s*\n([\s\S]*?)\n?\s*```$/)
  return fenced !== null ? fenced[1].trim() : text
}

function parseFlashcards(text: string): Flashcard[] | null {
  try {
    const parsed: unknown = JSON.parse(stripCodeFence(text))
    if (!Array.isArray(parsed) || parsed.length === 0) return null
    const cards = parsed.map((item) => FlashcardSchema.parse(item))
    return cards
  } catch {
    return null
  }
}

function parseHandoffTail(text: string): HandoffMessage[] | null {
  try {
    const parsed: unknown = JSON.parse(stripCodeFence(text))
    if (!Array.isArray(parsed)) return null
    const messages = parsed.map((item) => HandoffMessageSchema.parse(item))
    return messages.slice(-10)
  } catch {
    return null
  }
}

/**
 * Parse the raw end-class response.
 *
 * @throws {EndClassParseError} when the farewell section is missing —
 *         in that case the caller should save the raw output for a retry.
 */
export function parseEndClassOutput(raw: string): ParsedEndClass {
  const sections = splitEndClassSections(raw)
  const failed: ArtifactType[] = []

  const farewell = sections[END_CLASS_TAGS.farewell] ?? ''
  if (farewell.length === 0) {
    throw new EndClassParseError('Model output is missing the FAREWELL section')
  }

  const summary = sections[END_CLASS_TAGS.summary] ?? ''
  if (summary.length === 0) failed.push(ArtifactType.LessonSummary)

  const flashcardsRaw = sections[END_CLASS_TAGS.flashcards] ?? ''
  const flashcards = flashcardsRaw.length > 0 ? parseFlashcards(flashcardsRaw) : null
  if (flashcards === null) failed.push(ArtifactType.Flashcards)

  const diary = sections[END_CLASS_TAGS.diary] ?? ''
  if (diary.length === 0) failed.push(ArtifactType.Diary)

  const progress = sections[END_CLASS_TAGS.progress] ?? ''
  if (progress.length === 0) failed.push(ArtifactType.Progress)

  const handoffRaw = sections[END_CLASS_TAGS.handoffTail] ?? ''
  const handoffTail = handoffRaw.length > 0 ? parseHandoffTail(handoffRaw) : null
  if (handoffTail === null) failed.push(ArtifactType.HandoffTail)

  return {
    farewell,
    summary: summary.length > 0 ? summary : null,
    flashcards,
    diary: diary.length > 0 ? diary : null,
    progress: progress.length > 0 ? progress : null,
    handoffTail,
    failed
  }
}
