import { z } from 'zod'
import type { ArtifactId, ConversationId } from '../types/ids'
import { ArtifactType } from '../types/ids'
export interface Artifact {
  id: ArtifactId
  conversationId: ConversationId
  type: z.infer<typeof artifactTypeSchema>
  content: string
  createdAt: string
}

const artifactTypeSchema = z.enum([
  ArtifactType.LessonSummary,
  ArtifactType.Flashcards,
  ArtifactType.Diary,
  ArtifactType.Progress,
  ArtifactType.HandoffTail
])

const isoDatetime = z.string().datetime({ offset: true })

export const ArtifactSchema = z.object({
  id: z.string().min(1),
  conversationId: z.string().min(1),
  type: artifactTypeSchema,
  content: z.string().min(1),
  createdAt: isoDatetime
})

// ---------------------------------------------------------------
// End-class artifacts (Milestone 4)
// ---------------------------------------------------------------

/** Per-artifact generation outcome, so missing pieces can be re-run. */
export const ArtifactStatus = {
  Complete: 'complete',
  Failed: 'failed'
} as const
export type ArtifactStatus = (typeof ArtifactStatus)[keyof typeof ArtifactStatus]

export const FlashcardSchema = z.object({
  question: z.string().min(1),
  answer: z.string().min(1),
  explanation: z.string().default('')
})
export type Flashcard = z.infer<typeof FlashcardSchema>

export const HandoffMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1)
})
export type HandoffMessage = z.infer<typeof HandoffMessageSchema>

export const EndClassStatusSchema = z.object({
  lesson_summary: z.enum([ArtifactStatus.Complete, ArtifactStatus.Failed]),
  flashcards: z.enum([ArtifactStatus.Complete, ArtifactStatus.Failed]),
  diary: z.enum([ArtifactStatus.Complete, ArtifactStatus.Failed]),
  progress: z.enum([ArtifactStatus.Complete, ArtifactStatus.Failed]),
  handoff_tail: z.enum([ArtifactStatus.Complete, ArtifactStatus.Failed])
})
export type EndClassStatus = z.infer<typeof EndClassStatusSchema>

/**
 * Assembled end-class record for one conversation.
 *
 * Persisted as `{conversation}/artifacts/meta.json` plus human-readable
 * per-type files (`summary.md`, `flashcards.json`, ...) so the data can
 * be inspected and backed up without the app.
 */
export interface EndClassRecord {
  conversationId: string
  generatedAt: string
  model: string
  /** Shown to the learner once, right after class ends. */
  farewell: string
  status: EndClassStatus
  summary: string | null
  flashcards: Flashcard[] | null
  diary: string | null
  progress: string | null
  handoffTail: HandoffMessage[] | null
  /** Relative filename of the raw model output when parsing failed. */
  rawOutputFile: string | null
}

/** Result payload of one end-class generation run. */
export interface EndClassArtifactsResult {
  record: EndClassRecord
  /** Artifacts that could not be generated and can be re-run alone. */
  failed: ArtifactType[]
}
