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
