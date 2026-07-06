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
}

// ---------------------------------------------------------------
// Chat API (streaming)
// ---------------------------------------------------------------

export interface ChatAPI {
  /**
   * Start a streaming chat session.
   *
   * @param messages  Ordered conversation messages (system/user/assistant).
   * @param model     Optional model override (defaults to deepseek-v4-pro).
   * @returns         A unique session ID used to subscribe to events.
   */
  startStream: (
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    model?: string
  ) => Promise<string>

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
    deleteDeepSeekKey: () => ipcRenderer.invoke('settings:delete-deepseek-key')
  },
  chat: {
    startStream: (messages, model) =>
      ipcRenderer.invoke(CHAT_STREAM_START, { messages, model }),

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
