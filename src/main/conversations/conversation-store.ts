import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Conversation } from '../../shared/schemas/conversation'
import { ConversationSchema } from '../../shared/schemas/conversation'

// ---------------------------------------------------------------
// Types
// ---------------------------------------------------------------

export interface CreateConversationInput {
  worldId: string
  companionId: string
  textbookId: string | null
  title: string
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

function generateConversationId(): string {
  const timestamp = Date.now()
  const random = randomUUID().replace(/-/g, '').slice(0, 12)
  return `conv_${timestamp}_${random}`
}

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

function normalizeTitle(title: string): string {
  return title.trim()
}

function isValidNonEmpty(value: string): boolean {
  return value.trim().length > 0
}

// ---------------------------------------------------------------
// Store functions
// ---------------------------------------------------------------

export async function createConversation(
  rootDir: string,
  input: CreateConversationInput
): Promise<Conversation> {
  // Validate title (reject empty/whitespace)
  if (!isValidNonEmpty(input.title)) {
    throw new Error('Title must not be empty')
  }

  const id = generateConversationId()
  const now = new Date().toISOString()

  const conversationData = {
    id,
    worldId: input.worldId,
    companionId: input.companionId,
    textbookId: input.textbookId,
    title: normalizeTitle(input.title),
    createdAt: now,
    updatedAt: now,
    endedAt: null as string | null
  }

  // Validate before writing
  const parsed = ConversationSchema.safeParse(conversationData)
  if (!parsed.success) {
    throw new Error(
      `Invalid conversation metadata: ${JSON.stringify(parsed.error.issues)}`
    )
  }

  const dir = join(rootDir, id)
  await mkdir(dir, { recursive: true })

  // Write conversation.json (pretty-printed)
  await writeFile(join(dir, 'conversation.json'), JSON.stringify(parsed.data, null, 2), 'utf-8')

  return parsed.data as Conversation
}

export async function listConversations(rootDir: string): Promise<Conversation[]> {
  let entries: import('node:fs').Dirent[]
  try {
    entries = await readdir(rootDir, { withFileTypes: true })
  } catch {
    return []
  }

  const conversations: Conversation[] = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (!entry.name.startsWith('conv_')) continue

    try {
      // Security: validate entry name before constructing path
      assertSafeId(entry.name)

      const metadataPath = join(rootDir, entry.name, 'conversation.json')
      const raw = await readFile(metadataPath, 'utf-8')
      const parsed = JSON.parse(raw)
      const validated = ConversationSchema.parse(parsed)
      conversations.push(validated as Conversation)
    } catch {
      // Skip invalid entries silently
    }
  }

  // Sort by updatedAt descending (newest first)
  conversations.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  )

  return conversations
}

export async function getConversation(
  rootDir: string,
  id: string
): Promise<Conversation> {
  // Reject path traversal and null bytes before any I/O
  assertSafeId(id)

  const metadataPath = join(rootDir, id, 'conversation.json')

  let raw: string
  try {
    raw = await readFile(metadataPath, 'utf-8')
  } catch {
    throw new Error('Conversation not found')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('Invalid conversation metadata')
  }

  const validated = ConversationSchema.safeParse(parsed)
  if (!validated.success) {
    throw new Error(
      `Invalid conversation metadata: ${JSON.stringify(validated.error.issues)}`
    )
  }

  return validated.data as Conversation
}