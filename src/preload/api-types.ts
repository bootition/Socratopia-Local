import type { Companion, CustomCompanionInput } from '../shared/schemas/companion'
import type { Conversation } from '../shared/schemas/conversation'
import type {
  EndClassArtifactsResult,
  EndClassRecord,
  Flashcard
} from '../shared/schemas/artifact'
import type {
  Message,
  MessageSearchHit,
  MessageSource
} from '../shared/schemas/message'
import type { Note, NoteColor, NoteKind } from '../shared/schemas/note'
import type {
  AppPreferences,
  AppPreferencesPatch
} from '../shared/schemas/preferences'
import type { DeepSeekKeyTestResult } from '../shared/schemas/settings'
import type { Textbook, TextbookMetadata } from '../shared/schemas/textbook'
import type { UsageSummary } from '../shared/schemas/usage'
import type { ArtifactType } from '../shared/types/ids'

// ---------------------------------------------------------------
// Chat stream event payload types (exposed to renderer)
// ---------------------------------------------------------------

export interface StreamErrorData {
  code: string
  message: string
}

export interface StreamUsageData {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

// ---------------------------------------------------------------
// Settings API
// ---------------------------------------------------------------

export interface SettingsAPI {
  /** Check whether a DeepSeek API key has been configured */
  hasDeepSeekKey: () => Promise<boolean>
  /** Save a DeepSeek API key (encrypted on disk) */
  setDeepSeekKey: (key: string) => Promise<void>
  /** Remove the stored DeepSeek API key */
  deleteDeepSeekKey: () => Promise<void>
  /** Read non-secret app preferences (model, pace, narration, theme) */
  getPreferences: () => Promise<AppPreferences>
  /** Merge and persist a preferences patch */
  setPreferences: (patch: AppPreferencesPatch) => Promise<AppPreferences>
  /**
   * Test a DeepSeek key (or the stored one) with one tiny request.
   * Never throws: failures come back as `{ ok: false, message }`.
   */
  testDeepSeekKey: (key?: string) => Promise<DeepSeekKeyTestResult>
}

// ---------------------------------------------------------------
// Companion API
// ---------------------------------------------------------------

export interface CompanionsAPI {
  list: () => Promise<Companion[]>
  get: (companionId: string) => Promise<Companion>
  createCustom: (input: CustomCompanionInput) => Promise<Companion>
  updateCustom: (
    companionId: string,
    input: CustomCompanionInput
  ) => Promise<Companion>
  deleteCustom: (companionId: string) => Promise<void>
}

// ---------------------------------------------------------------
// Textbook API
// ---------------------------------------------------------------

export interface TextbookPageData {
  page: number
  totalPages: number
  text: string
}

export interface TextbooksAPI {
  createFromText: (input: {
    title: string
    format: 'markdown' | 'text'
    content: string
  }) => Promise<Textbook>
  list: () => Promise<TextbookMetadata[]>
  get: (textbookId: string) => Promise<Textbook>
  delete: (textbookId: string) => Promise<void>
  /** Open a native dialog and import .md/.txt/.pdf/.epub/.docx */
  importFile: () => Promise<Textbook | null>
  /** Read one page of a paged textbook (null when it has no page data) */
  getPage: (textbookId: string, page: number) => Promise<TextbookPageData | null>
  /** Textbook directories that exist on disk but cannot be read */
  listOrphans: () => Promise<string[]>
  /** Remove those broken directories; returns the number removed */
  cleanupOrphans: () => Promise<number>
}

// ---------------------------------------------------------------
// Conversation + message API
// ---------------------------------------------------------------

export interface ConversationsAPI {
  create: (input: {
    companionId: string
    textbookId: string | null
    title: string
  }) => Promise<Conversation>
  list: () => Promise<Conversation[]>
  get: (conversationId: string) => Promise<Conversation>
}

export interface MessagesAPI {
  append: (input: {
    conversationId: string
    role: 'user' | 'assistant' | 'system'
    content: string
    sources?: MessageSource[]
  }) => Promise<Message>
  list: (conversationId: string) => Promise<Message[]>
  search: (query: string, limit?: number) => Promise<MessageSearchHit[]>
  update: (input: {
    conversationId: string
    messageId: string
    content: string
  }) => Promise<Message>
}

// ---------------------------------------------------------------
// Artifact API (end-class outputs)
// ---------------------------------------------------------------

export interface ArtifactsAPI {
  endClass: (input: {
    conversationId: string
    companionId: string
    textbookId: string | null
    only?: import('../shared/types/ids').ArtifactType[]
  }) => Promise<EndClassArtifactsResult>
  get: (conversationId: string) => Promise<EndClassRecord | null>
  updateFlashcards: (input: {
    conversationId: string
    flashcards: Flashcard[]
  }) => Promise<EndClassRecord>
}

// ---------------------------------------------------------------
// Chat API (streaming)
// ---------------------------------------------------------------

/**
 * Classroom context sent to the main process. The renderer never
 * builds a system prompt: main loads the companion, world, textbook
 * and history from local storage and assembles the messages.
 */
export interface ChatStreamRequest {
  companionId: string
  textbookId: string | null
  conversationId: string | null
  userMessage: string
  model?: string
  reasoningEffort?: 'off' | 'low' | 'high' | 'max'
}

/** Result of starting a stream: session id + grounding sources. */
export interface ChatStartResult {
  sessionId: string
  sources: MessageSource[]
}

export interface ChatAPI {
  /**
   * Start a streaming chat session for one user message.
   *
   * @param request  Classroom context + user message.
   * @returns        Session id (for event subscription) plus the
   *                 textbook passages used to ground the reply.
   */
  startStream: (request: ChatStreamRequest) => Promise<ChatStartResult>

  /**
   * Cancel an active streaming session.
   *
   * Safe to call on already-completed sessions (no-op).
   */
  cancelStream: (sessionId: string) => Promise<void>

  /**
   * Subscribe to token events for a given session.
   *
   * @returns A function that unsubscribes the callback.
   */
  onToken: (sessionId: string, callback: (token: string) => void) => () => void

  /**
   * Subscribe to error events for a given session.
   *
   * @returns A function that unsubscribes the callback.
   */
  onError: (sessionId: string, callback: (error: StreamErrorData) => void) => () => void

  /**
   * Subscribe to end events for a given session.
   *
   * @param callback  Receives the finish_reason string.
   * @returns A function that unsubscribes the callback.
   */
  onEnd: (sessionId: string, callback: (finishReason: string) => void) => () => void

  /**
   * Subscribe to usage events for a given session.
   *
   * @returns A function that unsubscribes the callback.
   */
  onUsage: (sessionId: string, callback: (usage: StreamUsageData) => void) => () => void
}

// ---------------------------------------------------------------
// Usage stats API (F15)
// ---------------------------------------------------------------

export interface StatsAPI {
  /** Aggregated local token usage (and cost basis) across all lessons. */
  get: () => Promise<UsageSummary>
}

// ---------------------------------------------------------------
// Notes API (F05)
// ---------------------------------------------------------------

export interface NotesAPI {
  /** List notes, optionally only those of one conversation */
  list: (conversationId?: string) => Promise<Note[]>
  /** Create a note or highlight */
  create: (input: {
    conversationId: string
    messageId?: string | null
    kind?: NoteKind
    text: string
    quote?: string
    color?: NoteColor
  }) => Promise<Note>
  /** Edit note text and/or color */
  update: (input: { noteId: string; text?: string; color?: NoteColor }) => Promise<Note>
  /** Delete a note */
  delete: (noteId: string) => Promise<void>
}

// ---------------------------------------------------------------
// Archive API (F17)
// ---------------------------------------------------------------

export interface ArchiveAPI {
  /** Copy the whole data directory to a user-picked folder. */
  exportBackup: () => Promise<{ path: string } | null>
  /** Restore a user-picked backup directory over the current data. */
  restoreBackup: () => Promise<{ path: string } | null>
  /** Open the data directory in the OS file manager. */
  openDataFolder: () => Promise<void>
}

// ---------------------------------------------------------------
// SocratopiaAPI
// ---------------------------------------------------------------

export interface SocratopiaAPI {
  /** Retrieve the application version string */
  getVersion: () => Promise<string>
  /** Retrieve the current OS platform identifier */
  getPlatform: () => Promise<string>
  /** Settings operations (API key management) */
  settings: SettingsAPI
  /** Companion list / custom companion management */
  companions: CompanionsAPI
  /** Textbook library and multi-format import */
  textbooks: TextbooksAPI
  /** Conversations and messages */
  conversations: ConversationsAPI
  messages: MessagesAPI
  /** End-class artifacts */
  artifacts: ArtifactsAPI
  /** Local usage statistics */
  stats: StatsAPI
  /** Notes & highlights */
  notes: NotesAPI
  /** Local data backup / restore / data folder */
  archive: ArchiveAPI
  /** Chat streaming operations */
  chat: ChatAPI
}
