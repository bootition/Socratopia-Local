/**
 * Local full-text message search (F20).
 *
 * Scans every conversation's `messages.jsonl` for a case-insensitive
 * substring match and returns hits newest-first together with the
 * conversation title. Local-first and dependency-free: good enough for
 * a personal library, and it never sends anything off the machine.
 */

import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { Message } from '../../shared/schemas/message'
import { MessageSchema, type MessageSearchHit } from '../../shared/schemas/message'
import { ConversationSchema } from '../../shared/schemas/conversation'
import { listConversations } from '../conversations/conversation-store'

export interface SearchMessagesOptions {
  /** Maximum number of hits returned (default 50). */
  limit?: number
}

function isNotFound(err: unknown): boolean {
  return (
    err instanceof Error &&
    'code' in err &&
    (err as NodeJS.ErrnoException).code === 'ENOENT'
  )
}

async function readConversationTitle(
  rootDir: string,
  conversationId: string
): Promise<string | null> {
  try {
    const raw = await readFile(
      join(rootDir, conversationId, 'conversation.json'),
      'utf-8'
    )
    const parsed = ConversationSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data.title : null
  } catch {
    return null
  }
}

async function readConversationMessages(
  rootDir: string,
  conversationId: string
): Promise<Message[]> {
  let raw: string
  try {
    raw = await readFile(join(rootDir, conversationId, 'messages.jsonl'), 'utf-8')
  } catch (err: unknown) {
    if (isNotFound(err)) return []
    throw err
  }

  const messages: Message[] = []
  for (const line of raw.split('\n')) {
    if (line.trim().length === 0) continue
    try {
      messages.push(MessageSchema.parse(JSON.parse(line)) as Message)
    } catch {
      // Skip corrupt lines — search must never fail because of one bad row.
    }
  }
  return messages
}

/**
 * Search every local conversation for `query`.
 *
 * @returns newest-first hits, capped at `limit`.
 */
export async function searchMessages(
  conversationRoot: string,
  query: string,
  options: SearchMessagesOptions = {}
): Promise<MessageSearchHit[]> {
  const trimmed = query.trim()
  if (trimmed.length === 0) return []

  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200)
  const needle = trimmed.toLowerCase()

  let entries: import('node:fs').Dirent[]
  try {
    entries = await readdir(conversationRoot, { withFileTypes: true })
  } catch (err: unknown) {
    if (isNotFound(err)) return []
    throw err
  }

  const hits: MessageSearchHit[] = []

  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith('conv_')) continue

    const messages = await readConversationMessages(conversationRoot, entry.name)
    const matched = messages.filter((message) =>
      message.content.toLowerCase().includes(needle)
    )
    if (matched.length === 0) continue

    const title = await readConversationTitle(conversationRoot, entry.name)
    for (const message of matched) {
      hits.push({
        conversationId: message.conversationId,
        messageId: message.id,
        role: message.role,
        content: message.content,
        createdAt: message.createdAt,
        conversationTitle: title
      })
    }
  }

  hits.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )

  return hits.slice(0, limit)
}

/**
 * Convenience helper used by the history UI: conversations with a
 * message count, newest first. Reuses the metadata store.
 */
export async function listConversationSummaries(
  conversationRoot: string
): Promise<Array<{ id: string; title: string; updatedAt: string; messageCount: number }>> {
  const conversations = await listConversations(conversationRoot)
  const summaries = []
  for (const conversation of conversations) {
    const messages = await readConversationMessages(conversationRoot, conversation.id)
    summaries.push({
      id: conversation.id,
      title: conversation.title,
      updatedAt: conversation.updatedAt,
      messageCount: messages.length
    })
  }
  return summaries
}
