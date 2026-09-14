import { appendFile, readFile } from 'node:fs/promises'
import { writeFileAtomic } from '../storage/atomic-write'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Message } from '../../shared/schemas/message'
import { MessageSchema } from '../../shared/schemas/message'
import type { Conversation } from '../../shared/schemas/conversation'
import { ConversationSchema } from '../../shared/schemas/conversation'

// ---------------------------------------------------------------
// Types
// ---------------------------------------------------------------

export interface AppendMessageInput {
  role: 'user' | 'assistant' | 'system'
  content: string
}

// ---------------------------------------------------------------
// ID safety
// ---------------------------------------------------------------

const PATH_TRAVERSAL_PATTERN = /[\\/:.]/

function assertSafeId(id: string): void {
  if (!id || id.length === 0) {
    throw new Error('Invalid conversation id')
  }
  if (id.includes('\x00')) {
    throw new Error('Invalid conversation id')
  }
  if (PATH_TRAVERSAL_PATTERN.test(id)) {
    throw new Error('Invalid conversation id')
  }
}

// ---------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------

function generateMessageId(): string {
  const timestamp = Date.now()
  const random = randomUUID().replace(/-/g, '').slice(0, 12)
  return `msg_${timestamp}_${random}`
}

// ---------------------------------------------------------------
// Store functions
// ---------------------------------------------------------------

async function appendMessageInternal(
  rootDir: string,
  conversationId: string,
  input: AppendMessageInput
): Promise<Message> {
  // Reject path traversal and null bytes before any I/O
  assertSafeId(conversationId)

  const id = generateMessageId()
  const now = new Date().toISOString()

  const messageData = {
    id,
    conversationId,
    role: input.role,
    content: input.content,
    createdAt: now
  }

  // Validate against MessageSchema
  const parsed = MessageSchema.safeParse(messageData)
  if (!parsed.success) {
    throw new Error(
      `Invalid message: ${JSON.stringify(parsed.error.issues)}`
    )
  }

  const dir = join(rootDir, conversationId)

  // Validate conversation.json exists and is well-formed BEFORE writing messages
  const convPath = join(dir, 'conversation.json')
  let convRaw: string
  try {
    convRaw = await readFile(convPath, 'utf-8')
  } catch {
    throw new Error('Conversation not found')
  }

  let convJson: unknown
  try {
    convJson = JSON.parse(convRaw)
  } catch {
    throw new Error('Invalid conversation metadata')
  }

  // Revalidate existing conversation metadata through ConversationSchema
  const convParsed = ConversationSchema.safeParse(convJson)
  if (!convParsed.success) {
    throw new Error(
      `Invalid conversation metadata: ${JSON.stringify(convParsed.error.issues)}`
    )
  }

  // Update conversation updatedAt with validated metadata
  const updatedConv = {
    ...convParsed.data,
    updatedAt: now
  } as Conversation

  // Now that both validations passed, append the message
  const line = JSON.stringify(parsed.data) + '\n'
  await appendFile(join(dir, 'messages.jsonl'), line, 'utf-8')

  // Write back the validated and updated conversation metadata
  await writeFileAtomic(convPath, JSON.stringify(updatedConv, null, 2))

  return parsed.data as Message
}

export async function listMessages(
  rootDir: string,
  conversationId: string
): Promise<Message[]> {
  // Reject path traversal and null bytes before any I/O
  assertSafeId(conversationId)

  const messagesPath = join(rootDir, conversationId, 'messages.jsonl')

  let raw: string
  try {
    raw = await readFile(messagesPath, 'utf-8')
  } catch (err) {
    // Return empty array only when the file does not exist
    if (isNodeError(err) && err.code === 'ENOENT') {
      return []
    }
    throw err
  }

  const lines = raw.split('\n').filter(line => line.trim().length > 0)
  const messages: Message[] = []

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line)
      const validated = MessageSchema.parse(parsed)
      messages.push(validated as Message)
    } catch {
      // Skip invalid lines silently
    }
  }

  return messages
}

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------
function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && 'code' in err
}

/**
 * Rewrite one message in place.
 *
 * The whole file is rewritten, so this runs through the same per-file
 * queue as appends (see below) to avoid dropping a concurrently
 * appended reply.
 */
async function updateMessageInternal(
  rootDir: string,
  conversationId: string,
  messageId: string,
  content: string
): Promise<Message> {
  assertSafeId(conversationId)
  if (!messageId || messageId.includes('\0') || /[\\/:.]/.test(messageId)) {
    throw new Error('Invalid message id')
  }
  if (content.trim().length === 0) {
    throw new Error('Content must not be empty')
  }

  const messagesPath = join(rootDir, conversationId, 'messages.jsonl')
  let raw: string
  try {
    raw = await readFile(messagesPath, 'utf-8')
  } catch (err) {
    if (isNodeError(err) && err.code === 'ENOENT') {
      throw new Error('Conversation not found')
    }
    throw err
  }

  let updated: Message | null = null
  const nextLines = raw.split('\n').map((line) => {
    if (line.trim().length === 0) return line
    try {
      const parsed = MessageSchema.parse(JSON.parse(line))
      if (parsed.id !== messageId) return line
      const candidate = MessageSchema.parse({ ...parsed, content })
      updated = candidate as Message
      return JSON.stringify(candidate)
    } catch {
      return line
    }
  })

  if (updated === null) {
    throw new Error('Message not found')
  }

  await writeFileAtomic(messagesPath, nextLines.join('\n'))
  return updated
}

// ---------------------------------------------------------------
// Serialized writes (append vs edit must not race)
// ---------------------------------------------------------------

/**
 * `appendMessage` appends one JSONL line while `updateMessage`
 * rewrites the whole file. Without serialization an edit that reads
 * the file just before an append writes it back just after, silently
 * dropping the new reply. All writes to one conversation are queued.
 */
const writeQueues = new Map<string, Promise<unknown>>()

function enqueue<T>(messagesPath: string, task: () => Promise<T>): Promise<T> {
  const previous = writeQueues.get(messagesPath) ?? Promise.resolve()
  const next = previous.then(task, task)
  writeQueues.set(
    messagesPath,
    next.then(
      () => undefined,
      () => undefined
    )
  )
  return next
}

export async function appendMessage(
  rootDir: string,
  conversationId: string,
  input: AppendMessageInput
): Promise<Message> {
  assertSafeId(conversationId)
  return enqueue(join(rootDir, conversationId, 'messages.jsonl'), () =>
    appendMessageInternal(rootDir, conversationId, input)
  )
}

export async function updateMessage(
  rootDir: string,
  conversationId: string,
  messageId: string,
  content: string
): Promise<Message> {
  assertSafeId(conversationId)
  return enqueue(join(rootDir, conversationId, 'messages.jsonl'), () =>
    updateMessageInternal(rootDir, conversationId, messageId, content)
  )
}
