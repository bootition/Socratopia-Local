/**
 * IPC handlers for end-class (课后产物) operations.
 *
 * - `artifacts:end-class` runs the main-process generator: it resolves
 *   the companion/textbook/history from local storage, marks the
 *   conversation ended, and returns the artifact record plus the list
 *   of sections that failed (so the UI can re-run only those).
 * - `artifacts:get` returns the stored record (or null).
 */

import { ipcMain } from 'electron'
import {
  IpcEndClassInputSchema,
  IpcGetArtifactInputSchema,
  IpcUpdateFlashcardsInputSchema
} from '../../shared/schemas/ipc'
import {
  ARTIFACTS_END_CLASS,
  ARTIFACTS_GET,
  ARTIFACTS_UPDATE_FLASHCARDS
} from '../../shared/channel-names'
import type { AppPreferences } from '../../shared/schemas/preferences'
import { readCompanionIndex } from './companions'
import {
  getTextbook,
  parseCurrentPage,
  updateTextbookProgress
} from '../textbooks/textbook-store'
import { listMessages } from '../conversations/message-store'
import { endConversation } from '../conversations/conversation-store'
import type { ArtifactStore } from '../artifacts/artifact-store'
import type {
  EndClassGenerator,
  EndClassResult
} from '../artifacts/end-class-generator'

export interface RegisterArtifactIpcOptions {
  companionDir: string
  textbookDir: string
  conversationDir: string
  store: ArtifactStore
  generator: EndClassGenerator
  readApiKey: () => Promise<string | null>
  readPreferences: () => Promise<AppPreferences>
}

export function registerArtifactIpc(options: RegisterArtifactIpcOptions): void {
  const {
    companionDir,
    textbookDir,
    conversationDir,
    store,
    generator,
    readApiKey,
    readPreferences
  } = options

  ipcMain.handle(
    ARTIFACTS_END_CLASS,
    async (_event, input: unknown): Promise<EndClassResult> => {
      const parsed = IpcEndClassInputSchema.parse(input)

      const apiKey = await readApiKey()
      if (apiKey === null) {
        throw new Error('尚未配置 DeepSeek API Key，请先在设置里填写。')
      }

      const companions = await readCompanionIndex(companionDir)
      const companion = companions.find((c) => c.id === parsed.companionId)
      if (companion === undefined) {
        throw new Error('Companion not found')
      }

      // A deleted textbook must not make it impossible to finish the
      // lesson: fall back to generating artifacts without grounding.
      let textbook = null
      if (parsed.textbookId !== null) {
        try {
          textbook = await getTextbook(textbookDir, parsed.textbookId)
        } catch {
          textbook = null
        }
      }

      const history = await listMessages(conversationDir, parsed.conversationId)

      // The class ends as soon as the learner confirms, even if a
      // section later fails — retries run on the same ended lesson.
      await endConversation(conversationDir, parsed.conversationId)

      const preferences = await readPreferences()

      const result = await generator.generate({
        conversationId: parsed.conversationId,
        companion,
        textbook,
        history,
        model: preferences.model,
        only: parsed.only
      })

      // Commit the lesson's progress to the textbook only now that the
      // end-class run succeeded (F03: flipping pages during a lesson is
      // not a commitment; finishing the lesson is).
      if (textbook !== null && result.record.progress !== null) {
        const parsedPage = parseCurrentPage(result.record.progress)
        // Never store a page beyond the known total: the model may
        // hallucinate page numbers, and an out-of-range progress value
        // breaks the progress bar's ARIA semantics.
        const totalPages = textbook.progress.totalPages
        const currentPage =
          parsedPage !== null && totalPages !== null && totalPages > 0
            ? Math.min(parsedPage, totalPages)
            : parsedPage
        await updateTextbookProgress(textbookDir, textbook.id, {
          ...(currentPage !== null ? { currentPage } : {}),
          progressMarkdown: result.record.progress
        })
      }

      return result
    }
  )

  ipcMain.handle(ARTIFACTS_GET, async (_event, input: unknown) => {
    const parsed = IpcGetArtifactInputSchema.parse(input)
    return store.read(parsed.conversationId)
  })

  ipcMain.handle(ARTIFACTS_UPDATE_FLASHCARDS, async (_event, input: unknown) => {
    const parsed = IpcUpdateFlashcardsInputSchema.parse(input)
    return store.updateFlashcards(parsed.conversationId, parsed.flashcards)
  })
}
