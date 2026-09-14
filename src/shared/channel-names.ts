/**
 * IPC channel names shared between main process and preload.
 *
 * These constants ensure the channel strings stay in sync across
 * the main/preload boundary without either side importing from
 * Electron-internal modules directly.
 */

// --- Chat stream channels ---

export const CHAT_STREAM_START = 'chat:stream-start' as const
export const CHAT_STREAM_CANCEL = 'chat:stream-cancel' as const

export const CHAT_STREAM_EVENT = {
  token: 'chat:stream:token',
  error: 'chat:stream:error',
  end: 'chat:stream:end',
  usage: 'chat:stream:usage'
} as const

// --- Companion channels ---

export const COMPANIONS_LIST = 'companions:list' as const
export const COMPANIONS_GET = 'companions:get' as const
export const COMPANIONS_CREATE_CUSTOM = 'companions:create-custom' as const
export const COMPANIONS_UPDATE_CUSTOM = 'companions:update-custom' as const
export const COMPANIONS_DELETE_CUSTOM = 'companions:delete-custom' as const

// --- Textbook channels ---

export const TEXTBOOKS_CREATE_FROM_TEXT = 'textbooks:create-from-text' as const
export const TEXTBOOKS_LIST = 'textbooks:list' as const
export const TEXTBOOKS_GET = 'textbooks:get' as const
export const TEXTBOOKS_DELETE = 'textbooks:delete' as const
export const TEXTBOOKS_IMPORT_FILE = 'textbooks:import-file' as const
export const TEXTBOOKS_GET_PAGE = 'textbooks:get-page' as const
export const TEXTBOOKS_LIST_ORPHANS = 'textbooks:list-orphans' as const
export const TEXTBOOKS_CLEANUP_ORPHANS = 'textbooks:cleanup-orphans' as const

// --- Conversation channels ---

export const CONVERSATIONS_CREATE = 'conversations:create' as const
export const CONVERSATIONS_LIST = 'conversations:list' as const
export const CONVERSATIONS_GET = 'conversations:get' as const

// --- Message channels ---

export const MESSAGES_APPEND = 'messages:append' as const
export const MESSAGES_LIST = 'messages:list' as const
export const MESSAGES_SEARCH = 'messages:search' as const
export const MESSAGES_UPDATE = 'messages:update' as const

// --- Artifact channels ---

export const ARTIFACTS_END_CLASS = 'artifacts:end-class' as const
export const ARTIFACTS_GET = 'artifacts:get' as const
export const ARTIFACTS_UPDATE_FLASHCARDS = 'artifacts:update-flashcards' as const

// --- Note channels ---

export const NOTES_LIST = 'notes:list' as const
export const NOTES_CREATE = 'notes:create' as const
export const NOTES_UPDATE = 'notes:update' as const
export const NOTES_DELETE = 'notes:delete' as const

// --- Archive channels ---

export const ARCHIVE_EXPORT = 'archive:export' as const
export const ARCHIVE_RESTORE = 'archive:restore' as const
export const ARCHIVE_OPEN_FOLDER = 'archive:open-folder' as const

// --- Usage stats channels ---

export const STATS_GET = 'stats:get' as const

// --- Settings channels ---

export const SETTINGS_HAS_DEEPSEEK_KEY = 'settings:has-deepseek-key' as const
export const SETTINGS_SET_DEEPSEEK_KEY = 'settings:set-deepseek-key' as const
export const SETTINGS_DELETE_DEEPSEEK_KEY = 'settings:delete-deepseek-key' as const
export const SETTINGS_GET_PREFERENCES = 'settings:get-preferences' as const
export const SETTINGS_SET_PREFERENCES = 'settings:set-preferences' as const
export const SETTINGS_TEST_DEEPSEEK_KEY = 'settings:test-deepseek-key' as const