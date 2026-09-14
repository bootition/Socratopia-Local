import { z } from 'zod'
import { ArtifactType, CompanionSlot, TextbookFormat } from '../types/ids'

// --- IPC: World ---

export const IpcCreateWorldInputSchema = z.object({
  profileId: z.string().min(1),
  name: z.string().min(1)
})

// --- IPC: Custom companions (F34) ---

export const IpcCustomCompanionInputSchema = z.strictObject({
  name: z.string().trim().min(1, '名字不能为空').max(50),
  gender: z.enum(['male', 'female', 'other']),
  age: z.number().int().min(0).max(999),
  identity: z.string().trim().min(1, '身份不能为空').max(200),
  personalityKeywords: z
    .array(z.string().trim().min(1).max(30))
    .min(1, '至少一个关键词')
    .max(12),
  personality: z.string().trim().min(1, '性格描述不能为空').max(4000),
  speakingStyle: z.string().max(4000).default(''),
  emotionalExpressions: z.string().max(4000).default('')
})

export const IpcCompanionIdInputSchema = z.strictObject({
  companionId: z
    .string()
    .min(1, 'Companion id must not be empty')
    .refine((id) => !/[\\/.]/.test(id), 'Invalid companion id')
})

export const IpcUpdateCustomCompanionInputSchema = z.strictObject({
  companionId: z
    .string()
    .min(1, 'Companion id must not be empty')
    .refine((id) => !/[\\/.]/.test(id), 'Invalid companion id'),
  companion: IpcCustomCompanionInputSchema
})

// --- IPC: Companion ---

export const IpcImportCompanionInputSchema = z.object({
  worldId: z.string().min(1),
  sourceFile: z.string().min(1),
  slot: z.enum([CompanionSlot.A, CompanionSlot.B, CompanionSlot.C])
})

// --- IPC: Textbook ---

export const IpcCreateTextbookInputSchema = z.object({
  worldId: z.string().min(1),
  title: z.string().min(1),
  format: z.enum([
    TextbookFormat.Markdown,
    TextbookFormat.Text,
    TextbookFormat.Pdf,
    TextbookFormat.Epub
  ]),
  sourceFile: z.string().optional().default(''),
  content: z.string().optional()
})

export const IpcUpdateTextbookContentInputSchema = z.object({
  textbookId: z.string().min(1),
  content: z.string().min(1).max(4_000_000)
})

// --- IPC: Conversation ---

export const IpcCreateConversationInputSchema = z.object({
  worldId: z.string().min(1),
  companionId: z.string().min(1),
  textbookId: z.string().optional(),
  title: z.string().min(1)
})

export const IpcGetConversationInputSchema = z.object({
  conversationId: z.string().min(1)
})

export const IpcListConversationsInputSchema = z.object({
  worldId: z.string().min(1)
})

export const IpcDeleteConversationInputSchema = z.object({
  conversationId: z.string().min(1)
})

// --- IPC: Message ---

export const IpcSendMessageInputSchema = z.object({
  conversationId: z.string().min(1),
  content: z.string().min(1)
})

export const IpcGetMessagesInputSchema = z.object({
  conversationId: z.string().min(1)
})

export const IpcSearchMessagesInputSchema = z.strictObject({
  query: z
    .string()
    .trim()
    .min(2, 'Search query must be at least 2 characters')
    .max(200, 'Search query is too long'),
  limit: z.number().int().min(1).max(200).optional()
})

// --- IPC: Artifact ---

export const IpcEndClassInputSchema = z.strictObject({
  conversationId: z
    .string()
    .min(1, 'Conversation id must not be empty')
    .refine(safeIdRefinement, 'Invalid conversation id'),
  companionId: z
    .string()
    .min(1, 'Companion id must not be empty')
    .refine(safeIdRefinement, 'Invalid companion id'),
  textbookId: z
    .string()
    .min(1)
    .refine(safeIdRefinement, 'Invalid textbook id')
    .nullable()
    .default(null),
  /** Regenerate only these artifacts, keeping the rest from last time. */
  only: z
    .array(
      z.enum([
        ArtifactType.LessonSummary,
        ArtifactType.Flashcards,
        ArtifactType.Diary,
        ArtifactType.Progress,
        ArtifactType.HandoffTail
      ])
    )
    .min(1)
    .max(5)
    .optional()
})

export const IpcUpdateFlashcardsInputSchema = z.strictObject({
  conversationId: z
    .string()
    .min(1, 'Conversation id must not be empty')
    .refine(safeIdRefinement, 'Invalid conversation id'),
  flashcards: z
    .array(
      z.object({
        question: z.string().min(1, 'Question must not be empty'),
        answer: z.string().min(1, 'Answer must not be empty'),
        explanation: z.string()
      })
    )
    .max(100, 'Too many flashcards')
})

export const IpcGetArtifactInputSchema = z.strictObject({
  conversationId: z
    .string()
    .min(1, 'Conversation id must not be empty')
    .refine(safeIdRefinement, 'Invalid conversation id')
})

export const IpcListArtifactsInputSchema = z.object({
  conversationId: z.string().min(1)
})

// --- IPC: Notes ---

export const IpcListNotesInputSchema = z.strictObject({
  conversationId: z
    .string()
    .min(1)
    .refine(safeIdRefinement, 'Invalid conversation id')
    .optional()
})

export const IpcCreateNoteInputSchema = z.strictObject({
  conversationId: z
    .string()
    .min(1, 'Conversation id must not be empty')
    .refine(safeIdRefinement, 'Invalid conversation id'),
  messageId: z
    .string()
    .min(1)
    .refine(safeIdRefinement, 'Invalid message id')
    .nullable()
    .optional(),
  kind: z.enum([NoteKind.Note, NoteKind.Highlight]).optional(),
  text: z.string().trim().min(1, 'Note text must not be empty').max(4000),
  quote: z.string().max(4000).optional(),
  color: z
    .enum([NoteColor.Yellow, NoteColor.Green, NoteColor.Blue, NoteColor.Pink])
    .optional()
})

export const IpcUpdateNoteInputSchema = z.strictObject({
  noteId: z.string().min(1, 'Note id must not be empty'),
  text: z.string().trim().min(1).max(4000).optional(),
  color: z
    .enum([NoteColor.Yellow, NoteColor.Green, NoteColor.Blue, NoteColor.Pink])
    .optional()
})

export const IpcDeleteNoteInputSchema = z.strictObject({
  noteId: z.string().min(1, 'Note id must not be empty')
})

// --- IPC: Settings / API Key ---

const deepSeekKeySchema = z
  .string()
  .min(1, 'API Key 不能为空')
  .max(200, 'API Key 过长（最多 200 个字符）')
  .regex(
    /^[\x21-\x7e]+$/,
    'API Key 只能包含可见字符（请检查是否粘贴了换行或空格）'
  )

export const IpcSetDeepSeekKeyInputSchema = z.object({
  key: deepSeekKeySchema
})

export const IpcTestDeepSeekKeyInputSchema = z.strictObject({
  /** Optional unsaved key; falls back to the stored key when omitted. */
  key: deepSeekKeySchema.optional()
})
