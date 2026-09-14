/**
 * IPC handlers for the streaming chat pipeline.
 *
 * The main process manages a map of active StreamChatSession instances.
 * The renderer invokes `chat:stream-start` to create a session and
 * subscribes to events via preload wrappers that internally use
 * `ipcRenderer.on`.
 *
 * Security guarantees:
 * - The API key is read from SecureKeyStore in the main process and
 *   passed directly to the streaming adapter. It is never sent to
 *   the renderer.
 * - The renderer only sees sessionId, token events, error events,
 *   end events, and usage events.
 * - Input validated with Zod: safe companion/textbook/conversation
 *   ids, max 32768 chars per user message, model constrained to known
 *   DeepSeek models.
 * - The renderer sends no system prompt: main-process `buildRequest`
 *   loads local context and assembles the messages.
 */

import { ipcMain, type WebContents } from 'electron'
import { z } from 'zod'
import { StreamChatSession } from '../llm/stream-chat'
import type { DeepSeekStreamParams } from '../llm/stream-types'
import type { PromptRequestBuilder } from '../prompt/build-request'
import type { AppPreferences } from '../../shared/schemas/preferences'
import {
  CHAT_STREAM_START,
  CHAT_STREAM_CANCEL,
  CHAT_STREAM_EVENT
} from '../../shared/channel-names'

// ---------------------------------------------------------------
// Known DeepSeek model identifiers
// ---------------------------------------------------------------

export const DEEPSEEK_MODELS = ['deepseek-v4-pro', 'deepseek-v4-flash'] as const

// ---------------------------------------------------------------
// Zod schemas for IPC inputs
// ---------------------------------------------------------------

/**
 * Reject ids that could escape their storage directory. The stores
 * validate again before any I/O (defense in depth), but rejecting at
 * the IPC boundary gives the renderer a clear error.
 */
const safeIdRefinement = (id: string): boolean =>
  id.length > 0 && !/[\\/:.]/.test(id) && !id.includes('\x00')

export const ChatStreamStartInputSchema = z.strictObject({
  companionId: z
    .string()
    .max(200, 'Companion id is too long')
    .refine(safeIdRefinement, 'Invalid companion id'),
  textbookId: z
    .string()
    .max(200, 'Textbook id is too long')
    .refine(safeIdRefinement, 'Invalid textbook id')
    .nullable()
    .default(null),
  conversationId: z
    .string()
    .max(200, 'Conversation id is too long')
    .refine(safeIdRefinement, 'Invalid conversation id')
    .nullable()
    .default(null),
  userMessage: z
    .string()
    .min(1, 'Message content must not be empty')
    .max(32768, 'Message content exceeds 32768 characters'),
  model: z.enum(DEEPSEEK_MODELS).optional(),
  /** Thinking-mode override; defaults to the stored preference. */
  reasoningEffort: z.enum(['off', 'low', 'high', 'max']).optional()
})

export type ChatStreamStartInput = z.infer<typeof ChatStreamStartInputSchema>

export const ChatStreamCancelInputSchema = z.object({
  sessionId: z.string().min(1)
})

// ---------------------------------------------------------------
// Adapter factory type
// ---------------------------------------------------------------

/**
 * Function that creates a streaming adapter for a given set of params
 * and an API key. Injected to decouple IPC from the real HTTP adapter.
 */
export type StreamAdapterFactory = (
  params: DeepSeekStreamParams
) => AsyncIterable<import('../llm/stream-types').DeepSeekStreamChunk>

/**
 * Function that reads the API key. Returns null if no key is configured.
 * In production this wraps SecureKeyStore.readKey(); in tests it can
 * return a mock key.
 */
export type ApiKeyReader = () => Promise<string | null>

/** Usage reported after a completed stream, for local accounting. */
export interface UsageReport {
  model: string
  conversationId: string | null
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export type UsageReporter = (usage: UsageReport) => void

// ---------------------------------------------------------------
// Stream event payloads sent to the renderer
// ---------------------------------------------------------------

interface TokenPayload {
  sessionId: string
  token: string
}

interface ErrorPayload {
  sessionId: string
  code: string
  message: string
}

interface EndPayload {
  sessionId: string
  finishReason: string
}

interface UsagePayload {
  sessionId: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

// ---------------------------------------------------------------
// Registration
// ---------------------------------------------------------------

/**
 * Register IPC handlers for the streaming chat pipeline.
 *
 * @param getWebContents  Function that returns the current WebContents.
 *                        Typically wraps `mainWindow.webContents`.
 * @param adapterFactory  Creates a streaming adapter from params.
 * @param readApiKey      Reads the API key (never exposed to renderer).
 * @param readPreferences Reads non-secret app preferences (model, pace,
 *                        narration, thinking effort).
 * @param buildRequest    Builds the trusted prompt messages from the
 *                        classroom context. Runs in main only, so the
 *                        renderer cannot inject a system prompt.
 */
export function registerChatStreamIpc(
  getWebContents: () => WebContents,
  adapterFactory: StreamAdapterFactory,
  readApiKey: ApiKeyReader,
  readPreferences: () => Promise<AppPreferences>,
  buildRequest: PromptRequestBuilder,
  onUsage?: UsageReporter
): Map<string, StreamChatSession> {
  const sessions = new Map<string, StreamChatSession>()

  // --- chat:stream-start ---
  ipcMain.handle(CHAT_STREAM_START, async (_event, input: unknown) => {
    const parsed = ChatStreamStartInputSchema.parse(input)

    const apiKey = await readApiKey()
    if (apiKey === null) {
      throw new Error('尚未配置 DeepSeek API Key，请先在设置里填写。')
    }

    const preferences = await readPreferences()

    // Assemble the system prompt + windowed history in the main process.
    const request = await buildRequest({ ...parsed, preferences })

    const sessionId = generateSessionId()
    const wc = getWebContents()
    // A dead window must never crash a running stream.
    const safeSend = (channel: string, payload: unknown): void => {
      try {
        if (!wc.isDestroyed()) wc.send(channel, payload)
      } catch {
        // Window closed mid-stream — ignore.
      }
    }
    // Usage is reported once per session (the last non-null usage
    // chunk wins), so duplicate usage chunks cannot double-count.
    let lastUsage: { promptTokens: number; completionTokens: number; totalTokens: number } | null = null
    let usageRecorded = false
    const recordUsageOnce = (): void => {
      if (lastUsage === null || usageRecorded) return
      usageRecorded = true
      onUsage?.({
        model: request.model,
        conversationId: parsed.conversationId,
        promptTokens: lastUsage.promptTokens,
        completionTokens: lastUsage.completionTokens,
        totalTokens: lastUsage.totalTokens
      })
    }

    const session = new StreamChatSession(
      sessionId,
      {
        messages: request.messages,
        model: request.model,
        apiKey,
        reasoningEffort: parsed.reasoningEffort ?? preferences.reasoningEffort
      },
      { streamChat: (p) => adapterFactory(p) },
      (event) => {
        switch (event.type) {
          case 'token':
            safeSend(CHAT_STREAM_EVENT.token, {
              sessionId,
              token: event.token
            } satisfies TokenPayload)
            break
          case 'error':
            recordUsageOnce()
            safeSend(CHAT_STREAM_EVENT.error, {
              sessionId,
              code: event.code,
              message: event.message
            } satisfies ErrorPayload)
            break
          case 'end':
            recordUsageOnce()
            safeSend(CHAT_STREAM_EVENT.end, {
              sessionId,
              finishReason: event.finishReason
            } satisfies EndPayload)
            break
          case 'usage':
            // Keep the latest usage; recorded exactly once at end/error.
            lastUsage = {
              promptTokens: event.promptTokens,
              completionTokens: event.completionTokens,
              totalTokens: event.totalTokens
            }
            safeSend(CHAT_STREAM_EVENT.usage, {
              sessionId,
              promptTokens: event.promptTokens,
              completionTokens: event.completionTokens,
              totalTokens: event.totalTokens
            } satisfies UsagePayload)
            break
        }
      }
    )

    sessions.set(sessionId, session)

    // Start the stream (fire-and-forget; errors are caught inside Session)
    session.start().finally(() => {
      // Clean up after stream completes
      sessions.delete(sessionId)
    })

    // Return the grounding sources with the session id so the renderer
    // can persist them on the assistant message (no event race).
    return { sessionId, sources: request.sources }
  })

  // --- chat:stream-cancel ---
  ipcMain.handle(CHAT_STREAM_CANCEL, async (_event, input: unknown) => {
    const parsed = ChatStreamCancelInputSchema.parse(input)
    const session = sessions.get(parsed.sessionId)
    if (session) {
      session.cancel()
    }
    // If the session doesn't exist, it already completed — nothing to cancel
  })

  return sessions
}

// ---------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------

let sessionCounter = 0

function generateSessionId(): string {
  sessionCounter += 1
  return `stream-${Date.now()}-${sessionCounter}`
}
