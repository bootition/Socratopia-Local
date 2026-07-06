import { z } from 'zod'
import type { TextbookId, WorldId } from '../types/ids'
import { TextbookFormat } from '../types/ids'

export interface Textbook {
  id: TextbookId
  worldId: WorldId
  title: string
  format: z.infer<typeof textbookFormatSchema>
  sourceFile: string
  content: string
  progress: { currentPage: number; totalPages: number | null }
  createdAt: string
  updatedAt: string
}

const textbookFormatSchema = z.enum([
  TextbookFormat.Markdown,
  TextbookFormat.Text,
  TextbookFormat.Pdf,
  TextbookFormat.Epub
])

const progressSchema = z.object({
  currentPage: z.number().int().min(0),
  totalPages: z.number().int().min(0).nullable()
})

const isoDatetime = z.string().datetime({ offset: true })

export const TextbookSchema = z.object({
  id: z.string().min(1),
  worldId: z.string().min(1),
  title: z.string().min(1),
  format: textbookFormatSchema,
  sourceFile: z.string(),
  content: z.string().min(1),
  progress: progressSchema,
  createdAt: isoDatetime,
  updatedAt: isoDatetime
})
