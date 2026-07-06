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
