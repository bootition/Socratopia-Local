import { contextBridge, ipcRenderer } from 'electron'
import {
  ARCHIVE_EXPORT,
  ARCHIVE_OPEN_FOLDER,
  ARCHIVE_RESTORE,
  CHAT_STREAM_CANCEL,
  CHAT_STREAM_EVENT,
  CHAT_STREAM_START,
  ARTIFACTS_END_CLASS,
  ARTIFACTS_GET,
  ARTIFACTS_UPDATE_FLASHCARDS,
  COMPANIONS_CREATE_CUSTOM,
  COMPANIONS_DELETE_CUSTOM,
  COMPANIONS_GET,
  COMPANIONS_LIST,
  COMPANIONS_UPDATE_CUSTOM,
  CONVERSATIONS_CREATE,
  CONVERSATIONS_GET,
  CONVERSATIONS_LIST,
  MESSAGES_APPEND,
  MESSAGES_LIST,
  MESSAGES_SEARCH,
  MESSAGES_UPDATE,
  NOTES_CREATE,
  NOTES_DELETE,
  NOTES_LIST,
  NOTES_UPDATE,
  SETTINGS_GET_PREFERENCES,
  SETTINGS_SET_PREFERENCES,
  SETTINGS_TEST_DEEPSEEK_KEY,
  STATS_GET,
  TEXTBOOKS_CLEANUP_ORPHANS,
  TEXTBOOKS_CREATE_FROM_TEXT,
  TEXTBOOKS_DELETE,
  TEXTBOOKS_GET,
  TEXTBOOKS_GET_PAGE,
  TEXTBOOKS_IMPORT_FILE,
  TEXTBOOKS_LIST,
  TEXTBOOKS_LIST_ORPHANS
} from '../shared/channel-names'

import type { CustomCompanionInput } from '../shared/schemas/companion'
import type { Flashcard } from '../shared/schemas/artifact'
import type { MessageSource } from '../shared/schemas/message'
import type { AppPreferencesPatch } from '../shared/schemas/preferences'
import type { NoteColor, NoteKind } from '../shared/schemas/note'
import type {
  ArchiveAPI,
  ArtifactsAPI,
  ChatAPI,
  ChatStartResult,
  ChatStreamRequest,
  CompanionsAPI,
  ConversationsAPI,
  MessagesAPI,
  NotesAPI,
  SettingsAPI,
  SocratopiaAPI,
  StatsAPI,
  StreamErrorData,
  StreamUsageData,
  TextbookPageData,
  TextbooksAPI
} from './api-types'
export type {
  ArchiveAPI,
  ArtifactsAPI,
  ChatAPI,
  ChatStartResult,
  ChatStreamRequest,
  CompanionsAPI,
  ConversationsAPI,
  MessagesAPI,
  NotesAPI,
  SettingsAPI,
  SocratopiaAPI,
  StatsAPI,
  StreamErrorData,
  StreamUsageData,
  TextbookPageData,
  TextbooksAPI
} from './api-types'

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
  const handler = (
    _event: Electron.IpcRendererEvent,
    payload: P & { sessionId: string }
  ): void => {
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
    setDeepSeekKey: (key: string) =>
      ipcRenderer.invoke('settings:set-deepseek-key', { key }),
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
  companions: {
    list: () => ipcRenderer.invoke(COMPANIONS_LIST),
    get: (companionId: string) =>
      ipcRenderer.invoke(COMPANIONS_GET, { companionId }),
    createCustom: (input: CustomCompanionInput) =>
      ipcRenderer.invoke(COMPANIONS_CREATE_CUSTOM, input),
    updateCustom: (companionId: string, input: CustomCompanionInput) =>
      ipcRenderer.invoke(COMPANIONS_UPDATE_CUSTOM, { companionId, companion: input }),
    deleteCustom: (companionId: string) =>
      ipcRenderer.invoke(COMPANIONS_DELETE_CUSTOM, { companionId })
  },
  textbooks: {
    createFromText: (input: {
      title: string
      format: 'markdown' | 'text'
      content: string
    }) => ipcRenderer.invoke(TEXTBOOKS_CREATE_FROM_TEXT, input),
    list: () => ipcRenderer.invoke(TEXTBOOKS_LIST),
    get: (textbookId: string) => ipcRenderer.invoke(TEXTBOOKS_GET, { textbookId }),
    delete: (textbookId: string) =>
      ipcRenderer.invoke(TEXTBOOKS_DELETE, { textbookId }),
    importFile: () => ipcRenderer.invoke(TEXTBOOKS_IMPORT_FILE),
    getPage: (textbookId: string, page: number) =>
      ipcRenderer.invoke(TEXTBOOKS_GET_PAGE, { textbookId, page }),
    listOrphans: () => ipcRenderer.invoke(TEXTBOOKS_LIST_ORPHANS),
    cleanupOrphans: () => ipcRenderer.invoke(TEXTBOOKS_CLEANUP_ORPHANS)
  },
  conversations: {
    create: (input: {
      companionId: string
      textbookId: string | null
      title: string
    }) => ipcRenderer.invoke(CONVERSATIONS_CREATE, input),
    list: () => ipcRenderer.invoke(CONVERSATIONS_LIST),
    get: (conversationId: string) =>
      ipcRenderer.invoke(CONVERSATIONS_GET, { conversationId })
  },
  messages: {
    append: (input: {
      conversationId: string
      role: 'user' | 'assistant' | 'system'
      content: string
      sources?: MessageSource[]
    }) => ipcRenderer.invoke(MESSAGES_APPEND, input),
    list: (conversationId: string) =>
      ipcRenderer.invoke(MESSAGES_LIST, { conversationId }),
    search: (query: string, limit?: number) =>
      ipcRenderer.invoke(
        MESSAGES_SEARCH,
        limit === undefined ? { query } : { query, limit }
      ),
    update: (input: {
      conversationId: string
      messageId: string
      content: string
    }) => ipcRenderer.invoke(MESSAGES_UPDATE, input)
  },
  artifacts: {
    endClass: (input: {
      conversationId: string
      companionId: string
      textbookId: string | null
      only?: import('../shared/types/ids').ArtifactType[]
    }) => ipcRenderer.invoke(ARTIFACTS_END_CLASS, input),
    get: (conversationId: string) =>
      ipcRenderer.invoke(ARTIFACTS_GET, { conversationId }),
    updateFlashcards: (input: {
      conversationId: string
      flashcards: Flashcard[]
    }) => ipcRenderer.invoke(ARTIFACTS_UPDATE_FLASHCARDS, input)
  },
  stats: {
    get: () => ipcRenderer.invoke(STATS_GET)
  },
  notes: {
    list: (conversationId?: string) =>
      ipcRenderer.invoke(
        NOTES_LIST,
        conversationId === undefined ? {} : { conversationId }
      ),
    create: (input: {
      conversationId: string
      messageId?: string | null
      kind?: NoteKind
      text: string
      quote?: string
      color?: NoteColor
    }) => ipcRenderer.invoke(NOTES_CREATE, input),
    update: (input: { noteId: string; text?: string; color?: NoteColor }) =>
      ipcRenderer.invoke(NOTES_UPDATE, input),
    delete: (noteId: string) => ipcRenderer.invoke(NOTES_DELETE, { noteId })
  },
  archive: {
    exportBackup: () => ipcRenderer.invoke(ARCHIVE_EXPORT),
    restoreBackup: () => ipcRenderer.invoke(ARCHIVE_RESTORE),
    openDataFolder: () => ipcRenderer.invoke(ARCHIVE_OPEN_FOLDER)
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
