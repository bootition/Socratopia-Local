import { z } from 'zod'
import type { MessageId, ConversationId } from '../types/ids'
import { MessageRole } from '../types/ids'

export interface Message {
  id: MessageId
  conversationId: ConversationId
  role: z.infer<typeof messageRoleSchema>
  content: string
  createdAt: string
}

const messageRoleSchema = z.enum([
  MessageRole.User,
  MessageRole.Assistant,
  MessageRole.System
])

const isoDatetime = z.string().datetime({ offset: true })

export const MessageSchema = z.object({
  id: z.string().min(1),
  conversationId: z.string().min(1),
  role: messageRoleSchema,
  content: z.string().min(1).refine(
    (val) => val.trim().length > 0,
    { message: 'Content must not be only whitespace' }
  ),
  createdAt: isoDatetime
})
