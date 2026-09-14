/**
 * Prompt request builder — main-process glue between the classroom IPC
 * contract and the pure prompt builder.
 *
 * The renderer never assembles a system prompt. It sends *what* the
 * learner is doing (companion, textbook, conversation, message) and the
 * main process loads the trusted local context (character sheet, world
 * story, learner profile, textbook body, conversation history) and
 * builds the final DeepSeek message array here.
 *
 * This keeps the prompt-injection boundary in the main process and
 * makes `prompt-builder.ts` a live part of the chat pipeline instead of
 * dead code.
 */

import { readFile } from 'node:fs/promises'
import type { DeepSeekChatMessage, DeepSeekModel } from '../llm/types'
import { DEFAULT_PREFERENCES, type AppPreferences } from '../../shared/schemas/preferences'
import type { MessageSource } from '../../shared/schemas/message'
import { readCompanionIndex } from '../ipc/companions'
import { getTextbook } from '../textbooks/textbook-store'
import { segmentTextbook } from '../textbooks/textbook-index'
import { retrieveSegments } from '../textbooks/textbook-retrieval'
import { listMessages } from '../conversations/message-store'
import { buildMessages } from './prompt-builder'

// ---------------------------------------------------------------
// Types
// ---------------------------------------------------------------

/** Validated input coming from the `chat:stream-start` IPC handler. */
export interface PromptRequestInput {
  companionId: string
  textbookId: string | null
  conversationId: string | null
  /** The user message that triggered this stream. */
  userMessage: string
  model?: string
  /** Resolved app preferences (pace, narration, default model). */
  preferences?: AppPreferences
}

export interface PromptRequestPaths {
  companionDir: string
  textbookDir: string
  conversationDir: string
  /** `{world}/story.md` — world background injected into the prompt. */
  storyPath: string
  /** `{world}/learner.md` — learner profile, optional. */
  learnerPath: string
}

export interface PromptRequestResult {
  messages: DeepSeekChatMessage[]
  model: DeepSeekModel
  /** Textbook passages this reply is grounded in (F02). */
  sources: MessageSource[]
}

export type PromptRequestBuilder = (
  input: PromptRequestInput
) => Promise<PromptRequestResult>

// ---------------------------------------------------------------
// Builder
// ---------------------------------------------------------------

/**
 * Create a request builder bound to one local data layout.
 *
 * Throws when the companion cannot be resolved or the textbook exists
 * but has no readable body — those are programming/UI errors the
 * renderer should surface instead of sending a half-built prompt.
 */
export function createPromptRequestBuilder(
  paths: PromptRequestPaths
): PromptRequestBuilder {
  return async function buildRequest(
    input: PromptRequestInput
  ): Promise<PromptRequestResult> {
    const preferences = input.preferences ?? DEFAULT_PREFERENCES

    // 1. Companion metadata — trusted local index, validated by schema.
    const companions = await readCompanionIndex(paths.companionDir)
    const companion = companions.find((c) => c.id === input.companionId)
    if (!companion) {
      throw new Error(`Companion not found: ${input.companionId}`)
    }

    // 2. Optional world story and learner profile.
    const worldContext = await readOptionalText(paths.storyPath)
    const learnerInfo = await readOptionalText(paths.learnerPath)

    // 3. Optional current textbook: retrieve the passages relevant to
    // this question so replies can be verified against the original
    // text (F02). Falls back to the opening passages when nothing
    // matches, and never fabricates an anchor.
    let textbookContent: string | undefined
    let sources: MessageSource[] = []
    if (input.textbookId !== null) {
      // The material may have been deleted after the lesson started;
      // degrade to a lesson without textbook grounding instead of
      // failing every subsequent turn.
      let textbookContentRaw: string | null = null
      try {
        textbookContentRaw = (
          await getTextbook(paths.textbookDir, input.textbookId)
        ).content
      } catch {
        textbookContentRaw = null
      }

      if (textbookContentRaw !== null) {
      const segments = segmentTextbook(textbookContentRaw)
      const retrieved = retrieveSegments(segments, input.userMessage, 3)
      const hasMatches = retrieved.length > 0
      const injected = hasMatches ? retrieved : segments.slice(0, 3)

      textbookContent = injected
        .map((segment) => {
          const marker = hasMatches ? `[教材#${segment.index}] ` : ''
          return `${marker}${segment.label}\n${segment.text.slice(0, 1500)}`
        })
        .join('\n\n---\n\n')

      sources = retrieved.map(({ segmentId, label, text }) => ({
        segmentId,
        label,
        text
      }))
      }
    }

    // 4. Conversation history from the local message store.
    let history: DeepSeekChatMessage[] = []
    if (input.conversationId !== null) {
      const stored = await listMessages(paths.conversationDir, input.conversationId)
      history = stored.map((m) => ({ role: m.role, content: m.content }))

      // The renderer persists the user message before starting the
      // stream (so a failed request never loses it). That trailing
      // message is passed again as `userMessage`; drop the duplicate.
      const last = history[history.length - 1]
      if (last !== undefined && last.role === 'user' && last.content === input.userMessage) {
        history = history.slice(0, -1)
      }
    }

    const messages = buildMessages({
      companion,
      worldContext,
      learnerInfo: learnerInfo.length > 0 ? learnerInfo : undefined,
      textbookContent,
      history,
      userMessage: input.userMessage,
      pace: preferences.pace,
      narrationEnabled: preferences.narrationEnabled,
      // Citation rules only when we actually have verifiable passages.
      citationEnabled: sources.length > 0
    })

    return {
      messages,
      model: (input.model ?? preferences.model) as DeepSeekModel,
      sources
    }
  }
}

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

/** Read a UTF-8 text file, returning '' when it does not exist. */
async function readOptionalText(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf-8')
  } catch {
    return ''
  }
}
