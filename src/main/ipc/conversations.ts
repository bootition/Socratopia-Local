import { ipcMain } from 'electron'
import type { Conversation } from '../../shared/schemas/conversation'
import type { Message } from '../../shared/schemas/message'
import {
  IpcCreateConversationInputSchema,
  IpcGetConversationInputSchema,
  IpcAppendMessageInputSchema,
  IpcGetMessagesInputSchema,
  IpcSearchMessagesInputSchema
} from '../../shared/schemas/ipc'
import {
  CONVERSATIONS_CREATE,
  CONVERSATIONS_LIST,
  CONVERSATIONS_GET,
  MESSAGES_APPEND,
  MESSAGES_LIST,
  MESSAGES_SEARCH
} from '../../shared/channel-names'
import { DEFAULT_WORLD_ID } from '../storage/app-data'
import type { MessageSearchHit } from '../../shared/schemas/message'
import { searchMessages } from '../search/message-search'
import {
  createConversation,
  listConversations,
  getConversation
} from '../conversations/conversation-store'
import {
  appendMessage,
  listMessages
} from '../conversations/message-store'

// ---------------------------------------------------------------
// IPC registration
// ---------------------------------------------------------------

export interface RegisterConversationIpcOptions {
  conversationDir: string
}

/**
 * Register IPC handlers for conversation and message operations.
 *
 * Exposes:
 * - `conversations:create` → Conversation (create new conversation)
 * - `conversations:list`   → Conversation[] (list all conversations)
 * - `conversations:get`    → Conversation (get by id)
 * - `messages:append`      → Message (append a message to a conversation)
 * - `messages:list`        → Message[] (list messages for a conversation)
 *
 * The renderer never receives filesystem paths.
 */
export function registerConversationIpc(options: RegisterConversationIpcOptions): void {
  const { conversationDir } = options

  ipcMain.handle(CONVERSATIONS_CREATE, async (_event, input: unknown): Promise<Conversation> => {
    const parsed = IpcCreateConversationInputSchema.parse(input)

    return createConversation(conversationDir, {
      worldId: DEFAULT_WORLD_ID,
      companionId: parsed.companionId,
      textbookId: parsed.textbookId,
      title: parsed.title
    })
  })

  ipcMain.handle(CONVERSATIONS_LIST, async (): Promise<Conversation[]> => {
    return listConversations(conversationDir)
  })

  ipcMain.handle(CONVERSATIONS_GET, async (_event, input: unknown): Promise<Conversation> => {
    const parsed = IpcGetConversationInputSchema.parse(input)
    return getConversation(conversationDir, parsed.conversationId)
  })

  ipcMain.handle(MESSAGES_APPEND, async (_event, input: unknown): Promise<Message> => {
    const parsed = IpcAppendMessageInputSchema.parse(input)
    return appendMessage(conversationDir, parsed.conversationId, {
      role: parsed.role,
      content: parsed.content
    })
  })

  ipcMain.handle(MESSAGES_LIST, async (_event, input: unknown): Promise<Message[]> => {
    const parsed = IpcGetMessagesInputSchema.parse(input)
    return listMessages(conversationDir, parsed.conversationId)
  })

  ipcMain.handle(
    MESSAGES_SEARCH,
    async (_event, input: unknown): Promise<MessageSearchHit[]> => {
      const parsed = IpcSearchMessagesInputSchema.parse(input)
      return searchMessages(conversationDir, parsed.query, { limit: parsed.limit })
    }
  )
}