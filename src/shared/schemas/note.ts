import { z } from 'zod'

/**
 * Classroom notes & highlights (F05).
 *
 * Notes are attached to a message (with an optional verbatim quote) or
 * stand alone as lesson-level reflections. Stored as plain JSONL in the
 * world directory so the learner can read/back up the file directly.
 */

export const NoteKind = {
  Note: 'note',
  Highlight: 'highlight'
} as const
export type NoteKind = (typeof NoteKind)[keyof typeof NoteKind]

export const NoteColor = {
  Yellow: 'yellow',
  Green: 'green',
  Blue: 'blue',
  Pink: 'pink'
} as const
export type NoteColor = (typeof NoteColor)[keyof typeof NoteColor]

export const NoteSchema = z.object({
  id: z.string().min(1),
  conversationId: z.string().min(1),
  /** Message this note/highlight belongs to (null = lesson-level). */
  messageId: z.string().min(1).nullable(),
  kind: z.enum([NoteKind.Note, NoteKind.Highlight]),
  /** The learner's own words. */
  text: z.string().min(1),
  /** Quoted source text for highlights ('' when none). */
  quote: z.string().default(''),
  color: z.enum([
    NoteColor.Yellow,
    NoteColor.Green,
    NoteColor.Blue,
    NoteColor.Pink
  ]),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true })
})

export type Note = z.infer<typeof NoteSchema>
