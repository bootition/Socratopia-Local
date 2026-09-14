import { z } from 'zod'
import { ArtifactType, CompanionSlot, TextbookFormat } from '../types/ids'
import { NoteColor, NoteKind } from './note'
import { MessageSourceSchema } from './message'

// IPC input schemas. Every renderer -> main call is validated here.

export const IpcCustomCompanionInputSchema = z.strictObject({
  name: z.string().trim().min(1, "名字不能为空").max(50),
  gender: z.enum(["male", "female", "other"]),
  age: z.number().int().min(0).max(999),
  identity: z.string().trim().min(1, "身份不能为空").max(200),
  personalityKeywords: z.array(z.string().trim().min(1).max(30)).min(1, "至少一个关键词").max(12),
  personality: z.string().trim().min(1, "性格描述不能为空").max(4e3),
  speakingStyle: z.string().max(4e3).default(""),
  emotionalExpressions: z.string().max(4e3).default("")
});
export const IpcCompanionIdInputSchema = z.strictObject({
  companionId: z.string().min(1, "Companion id must not be empty").refine((id: string) => !/[\/.]/.test(id), "Invalid companion id")
});
export const IpcUpdateCustomCompanionInputSchema = z.strictObject({
  companionId: z.string().min(1, "Companion id must not be empty").refine((id: string) => !/[\/.]/.test(id), "Invalid companion id"),
  companion: IpcCustomCompanionInputSchema
});
z.object({
  worldId: z.string().min(1),
  sourceFile: z.string().min(1),
  slot: z.enum([CompanionSlot.A, CompanionSlot.B, CompanionSlot.C])
});
z.object({
  worldId: z.string().min(1),
  title: z.string().min(1),
  format: z.enum([
    TextbookFormat.Markdown,
    TextbookFormat.Text,
    TextbookFormat.Pdf,
    TextbookFormat.Epub
  ]),
  sourceFile: z.string().optional().default(""),
  content: z.string().optional()
});
z.object({
  textbookId: z.string().min(1),
  content: z.string().min(1).max(4e6)
});
const safeIdRefinement$1 = (id: string) => !/[\\/:.]/.test(id) && !id.includes("\0");
export const IpcCreateConversationInputSchema = z.strictObject({
  companionId: z.string().min(1, "Companion id must not be empty").refine(safeIdRefinement$1, "Invalid companion id"),
  textbookId: z.string().min(1).refine(safeIdRefinement$1, "Invalid textbook id").nullable(),
  title: z.string().trim().min(1, "Title must not be empty")
});
export const IpcGetConversationInputSchema = z.strictObject({
  conversationId: z.string().min(1, "Conversation id must not be empty").refine(safeIdRefinement$1, "Invalid conversation id")
});
z.object({
  worldId: z.string().min(1)
});
z.object({
  conversationId: z.string().min(1)
});
export const IpcAppendMessageInputSchema = z.strictObject({
  conversationId: z.string().min(1, "Conversation id must not be empty").refine(safeIdRefinement$1, "Invalid conversation id"),
  role: z.enum(["user", "assistant", "system"]),
  content: z.string().min(1, "Content must not be empty").max(32768, "Message exceeds the 32,768 character limit").refine(
    (val) => val.trim().length > 0,
    "Content must not be only whitespace"
  ),
  /** Grounding passages stored alongside assistant messages (F02). */
  sources: z.array(MessageSourceSchema).max(20).optional()
});
z.object({
  conversationId: z.string().min(1),
  content: z.string().min(1)
});
export const IpcGetMessagesInputSchema = z.strictObject({
  conversationId: z.string().min(1, "Conversation id must not be empty").refine(safeIdRefinement$1, "Invalid conversation id")
});
export const IpcUpdateMessageInputSchema = z.strictObject({
  conversationId: z.string().min(1, "Conversation id must not be empty").refine(safeIdRefinement$1, "Invalid conversation id"),
  messageId: z.string().min(1, "Message id must not be empty").refine(safeIdRefinement$1, "Invalid message id"),
  content: z.string().min(1, "Content must not be empty").max(32768, "Content exceeds 32768 characters").refine((value) => value.trim().length > 0, "Content must not be empty")
});
export const IpcSearchMessagesInputSchema = z.strictObject({
  query: z.string().trim().min(2, "Search query must be at least 2 characters").max(200, "Search query is too long"),
  limit: z.number().int().min(1).max(200).optional()
});
export const IpcEndClassInputSchema = z.strictObject({
  conversationId: z.string().min(1, "Conversation id must not be empty").refine(safeIdRefinement$1, "Invalid conversation id"),
  companionId: z.string().min(1, "Companion id must not be empty").refine(safeIdRefinement$1, "Invalid companion id"),
  textbookId: z.string().min(1).refine(safeIdRefinement$1, "Invalid textbook id").nullable().default(null),
  /** Regenerate only these artifacts, keeping the rest from last time. */
  only: z.array(
    z.enum([
      ArtifactType.LessonSummary,
      ArtifactType.Flashcards,
      ArtifactType.Diary,
      ArtifactType.Progress,
      ArtifactType.HandoffTail
    ])
  ).min(1).max(5).optional()
});
export const IpcUpdateFlashcardsInputSchema = z.strictObject({
  conversationId: z.string().min(1, "Conversation id must not be empty").refine(safeIdRefinement$1, "Invalid conversation id"),
  flashcards: z.array(
    z.object({
      question: z.string().min(1, "Question must not be empty"),
      answer: z.string().min(1, "Answer must not be empty"),
      explanation: z.string()
    })
  ).max(100, "Too many flashcards")
});
export const IpcGetArtifactInputSchema = z.strictObject({
  conversationId: z.string().min(1, "Conversation id must not be empty").refine(safeIdRefinement$1, "Invalid conversation id")
});
z.object({
  conversationId: z.string().min(1)
});
export const IpcListNotesInputSchema = z.strictObject({
  conversationId: z.string().min(1).refine(safeIdRefinement$1, "Invalid conversation id").optional()
});
export const IpcCreateNoteInputSchema = z.strictObject({
  conversationId: z.string().min(1, "Conversation id must not be empty").refine(safeIdRefinement$1, "Invalid conversation id"),
  messageId: z.string().min(1).refine(safeIdRefinement$1, "Invalid message id").nullable().optional(),
  kind: z.enum([NoteKind.Note, NoteKind.Highlight]).optional(),
  text: z.string().trim().min(1, "Note text must not be empty").max(4e3),
  quote: z.string().max(4e3).optional(),
  color: z.enum([NoteColor.Yellow, NoteColor.Green, NoteColor.Blue, NoteColor.Pink]).optional()
});
export const IpcUpdateNoteInputSchema = z.strictObject({
  noteId: z.string().min(1, "Note id must not be empty"),
  text: z.string().trim().min(1).max(4e3).optional(),
  color: z.enum([NoteColor.Yellow, NoteColor.Green, NoteColor.Blue, NoteColor.Pink]).optional()
});
export const IpcDeleteNoteInputSchema = z.strictObject({
  noteId: z.string().min(1, "Note id must not be empty")
});
const deepSeekKeySchema = z.string().min(1, "API Key 不能为空").max(200, "API Key 过长（最多 200 个字符）").regex(
  /^[!-~]+$/,
  "API Key 只能包含可见字符（请检查是否粘贴了换行或空格）"
);
export const IpcSetDeepSeekKeyInputSchema = z.object({
  key: deepSeekKeySchema
});
export const IpcTestDeepSeekKeyInputSchema = z.strictObject({
  /** Optional unsaved key; falls back to the stored key when omitted. */
  key: deepSeekKeySchema.optional()
});
export const IpcCreateTextbookFromTextInputSchema = z.strictObject({
  title: z.string().trim().min(1, "Title must not be empty").max(200, "Title is too long"),
  format: z.enum([TextbookFormat.Markdown, TextbookFormat.Text]),
  content: z.string().min(1, "Content must not be empty").max(4e6, "Content exceeds the 4,000,000 character limit").refine(
    (val) => val.trim().length > 0,
    "Content must not be empty"
  )
});
export const IpcGetTextbookInputSchema = z.object({
  textbookId: z.string().min(1, "Textbook id must not be empty").refine(
    (id: string) => !/[\\/:.]/.test(id),
    "Invalid textbook id"
  ).refine(
    (id: string) => !id.includes("\0"),
    "Invalid textbook id"
  )
});
export const IpcGetTextbookPageInputSchema = z.strictObject({
  textbookId: z.string().min(1, "Textbook id must not be empty").refine(safeIdRefinement$1, "Invalid textbook id"),
  page: z.number().int().min(1).max(1e5)
});
export const IpcDeleteTextbookInputSchema = z.strictObject({
  textbookId: z.string().min(1, "Textbook id must not be empty").refine(safeIdRefinement$1, "Invalid textbook id")
});
export const IpcGetCompanionInputSchema = z.object({
  companionId: z.string().min(1, "Companion id must not be empty").refine(
    (id: string) => !/[\\/.]/.test(id),
    "Invalid companion id"
  )
});
