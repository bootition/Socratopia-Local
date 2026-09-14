import { z } from 'zod'
import type { TextbookId, WorldId } from '../types/ids'
import { TextbookFormat } from '../types/ids'

/**
 * Textbook metadata as persisted in `textbook.json`.
 *
 * Deliberately excludes the textbook body: the body lives in
 * `source.md` inside the same directory. Keeping them apart means
 * listing textbooks never has to parse or transfer multi-megabyte
 * strings (see `textbook-store.ts`).
 */
export interface TextbookMetadata {
  id: TextbookId
  worldId: WorldId
  title: string
  format: z.infer<typeof textbookFormatSchema>
  sourceFile: string
  /** Original imported file kept next to source.md (null for pasted text). */
  originalFile: string | null
  progress: { currentPage: number; totalPages: number | null }
  createdAt: string
  updatedAt: string
}

/** Textbook metadata plus its loaded body content. */
export interface Textbook extends TextbookMetadata {
  content: string
}

const textbookFormatSchema = z.enum([
  TextbookFormat.Markdown,
  TextbookFormat.Text,
  TextbookFormat.Pdf,
  TextbookFormat.Epub,
  TextbookFormat.Docx
])

const progressSchema = z.object({
  currentPage: z.number().int().min(0),
  totalPages: z.number().int().min(0).nullable()
})

const isoDatetime = z.string().datetime({ offset: true })

/**
 * Metadata-only schema. `z.object` strips unknown keys by default, so
 * legacy `textbook.json` files that still embed a `content` field are
 * accepted and the stale content is dropped.
 */
export const TextbookMetadataSchema = z.object({
  id: z.string().min(1),
  worldId: z.string().min(1),
  title: z.string().min(1),
  format: textbookFormatSchema,
  sourceFile: z.string(),
  originalFile: z.string().nullable().default(null),
  progress: progressSchema,
  createdAt: isoDatetime,
  updatedAt: isoDatetime
})

/** Full textbook (metadata + content) schema. */
export const TextbookSchema = TextbookMetadataSchema.extend({
  content: z.string().min(1)
})
