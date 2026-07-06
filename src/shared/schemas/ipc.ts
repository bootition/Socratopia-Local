import { z } from 'zod'
import { CompanionSlot, TextbookFormat } from '../types/ids'

// --- IPC: World ---

export const IpcCreateWorldInputSchema = z.object({
  profileId: z.string().min(1),
  name: z.string().min(1)
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
  content: z.string().min(1)
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

export const IpcSearchMessagesInputSchema = z.object({
  worldId: z.string().min(1),
  query: z.string().min(2)
})

// --- IPC: Artifact ---

export const IpcEndClassInputSchema = z.object({
  conversationId: z.string().min(1)
})

export const IpcGetArtifactInputSchema = z.object({
  artifactId: z.string().min(1)
})

export const IpcListArtifactsInputSchema = z.object({
  conversationId: z.string().min(1)
})

// --- IPC: Settings / API Key ---

export const IpcSetDeepSeekKeyInputSchema = z.object({
  key: z.string().min(1, 'API key must not be empty').trim()
})
