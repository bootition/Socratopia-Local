import { contextBridge, ipcRenderer } from 'electron'
import {
  CHAT_STREAM_START,
  CHAT_STREAM_CANCEL,
  CHAT_STREAM_EVENT
} from '../shared/channel-names'

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
  /** Chat streaming operations */
  chat: ChatAPI
}

// ---------------------------------------------------------------
// Event listener helpers (internal — not exposed)
// ---------------------------------------------------------------

/**
 * Generic helper: subscribe to an IPC event channel with a sessionId
 * filter, and return an unsubscribe function.
 *
 * The sessionId is stripped from the payload before invoking the
 * user callback so the renderer never sees it.
 */
function createEventSubscriber<P>(
  channel: string,
  sessionId: string,
  callback: (payload: P) => void
): () => void {
  const handler = (_event: Electron.IpcRendererEvent, payload: P & { sessionId: string }) => {
    if (payload.sessionId === sessionId) {
      // Strip sessionId before passing to user callback
      const { sessionId: _sid, ...rest } = payload
      callback(rest as unknown as P)
    }
  }

  ipcRenderer.on(channel, handler)

  return () => {
    ipcRenderer.removeListener(channel, handler)
  }
}

// ---------------------------------------------------------------
// Build and expose the bridge
// ---------------------------------------------------------------

const socratopia: SocratopiaAPI = {
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  getPlatform: () => ipcRenderer.invoke('app:get-platform'),
  settings: {
    hasDeepSeekKey: () => ipcRenderer.invoke('settings:has-deepseek-key'),
    setDeepSeekKey: (key: string) => ipcRenderer.invoke('settings:set-deepseek-key', { key }),
    deleteDeepSeekKey: () => ipcRenderer.invoke('settings:delete-deepseek-key'),
    getPreferences: () => ipcRenderer.invoke(SETTINGS_GET_PREFERENCES),
    setPreferences: (patch: AppPreferencesPatch) =>
      ipcRenderer.invoke(SETTINGS_SET_PREFERENCES, patch),
    testDeepSeekKey: (key?: string) =>
      ipcRenderer.invoke(
        SETTINGS_TEST_DEEPSEEK_KEY,
        key === undefined ? {} : { key }
      )
  },
  chat: {
    startStream: (request: ChatStreamRequest) =>
      ipcRenderer.invoke(CHAT_STREAM_START, request),

    cancelStream: (sessionId: string) =>
      ipcRenderer.invoke(CHAT_STREAM_CANCEL, { sessionId }),

    onToken: (sessionId: string, callback: (token: string) => void) =>
      createEventSubscriber<{ token: string }>(
        CHAT_STREAM_EVENT.token,
        sessionId,
        (payload) => callback(payload.token)
      ),

    onError: (sessionId: string, callback: (error: StreamErrorData) => void) =>
      createEventSubscriber<StreamErrorData>(
        CHAT_STREAM_EVENT.error,
        sessionId,
        callback
      ),

    onEnd: (sessionId: string, callback: (finishReason: string) => void) =>
      createEventSubscriber<{ finishReason: string }>(
        CHAT_STREAM_EVENT.end,
        sessionId,
        (payload) => callback(payload.finishReason)
      ),

    onUsage: (sessionId: string, callback: (usage: StreamUsageData) => void) =>
      createEventSubscriber<StreamUsageData>(
        CHAT_STREAM_EVENT.usage,
        sessionId,
        callback
      )
  }
}

contextBridge.exposeInMainWorld('socratopia', socratopia)
