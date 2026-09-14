import { z } from 'zod'
import type { MessageId, ConversationId } from '../types/ids'
import { MessageRole } from '../types/ids'

export interface Message {
  id: MessageId
  conversationId: ConversationId
  role: z.infer<typeof messageRoleSchema>
  content: string
  createdAt: string
  /** Textbook passages this reply was grounded in (F02 citation). */
  sources?: MessageSource[]
}

const messageRoleSchema = z.enum([
  MessageRole.User,
  MessageRole.Assistant,
  MessageRole.System
])

const isoDatetime = z.string().datetime({ offset: true })

/**
 * A textbook passage attached to an assistant message so the learner
 * can verify what the companion said against the original text.
 */
export const MessageSourceSchema = z.object({
  /** Stable segment id, e.g. `seg_12` */
  segmentId: z.string().min(1),
  /** Human-readable anchor, e.g. `第一章 · 第 3 段` */
  label: z.string().min(1),
  /** Verbatim passage text */
  text: z.string().min(1)
})

export type MessageSource = z.infer<typeof MessageSourceSchema>

export const MessageSchema = z.object({
  id: z.string().min(1),
  conversationId: z.string().min(1),
  role: messageRoleSchema,
  content: z.string().min(1).refine(
    (val) => val.trim().length > 0,
    { message: 'Content must not be only whitespace' }
  ),
  createdAt: isoDatetime,
  sources: z.array(MessageSourceSchema).max(20).optional()
})

/** One keyword-search hit across all local conversations. */
export interface MessageSearchHit {
  conversationId: string
  messageId: string
  role: z.infer<typeof messageRoleSchema>
  content: string
  createdAt: string
  /** Title of the conversation, when it could be resolved. */
  conversationTitle: string | null
}
