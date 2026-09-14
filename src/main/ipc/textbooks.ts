import { ipcMain } from 'electron'
import type { Textbook } from '../../shared/schemas/textbook'
import { IpcCreateTextbookFromTextInputSchema, IpcGetTextbookInputSchema } from '../../shared/schemas/ipc'
import { TEXTBOOKS_CREATE_FROM_TEXT, TEXTBOOKS_LIST, TEXTBOOKS_GET } from '../../shared/channel-names'
import {
  createTextbookFromText,
  listTextbooks,
  getTextbook
} from '../textbooks/textbook-store'

// ---------------------------------------------------------------
// IPC registration
// ---------------------------------------------------------------

export interface RegisterTextbookIpcOptions {
  textbookDir: string
}

/**
 * Register IPC handlers for textbook operations.
 *
 * Exposes:
 * - `textbooks:create-from-text` → Textbook (create from pasted markdown/text)
 * - `textbooks:list`             → Textbook[] (metadata for all textbooks)
 * - `textbooks:get`              → Textbook (single textbook by id)
 *
 * The renderer never receives filesystem paths beyond the
 * `sourceFile` field (always 'source.md') and the text content.
 */
export function registerTextbookIpc(options: RegisterTextbookIpcOptions): void {
  const { textbookDir } = options

  ipcMain.handle(TEXTBOOKS_CREATE_FROM_TEXT, async (_event, input: unknown): Promise<Textbook> => {
    const parsed = IpcCreateTextbookFromTextInputSchema.parse(input)

    const textbook = await createTextbookFromText(textbookDir, {
      worldId: 'world_default',
      title: parsed.title,
      format: parsed.format,
      content: parsed.content
    })

    return textbook
  })

  ipcMain.handle(TEXTBOOKS_LIST, async (): Promise<Textbook[]> => {
    return listTextbooks(textbookDir)
  })

  ipcMain.handle(TEXTBOOKS_GET, async (_event, input: unknown): Promise<Textbook> => {
    const parsed = IpcGetTextbookInputSchema.parse(input)
    return getTextbook(textbookDir, parsed.textbookId)
  })
}