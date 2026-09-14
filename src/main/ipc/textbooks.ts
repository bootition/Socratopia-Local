import {
  dialog,
  ipcMain,
  type BrowserWindow,
  type OpenDialogOptions
} from 'electron'
import { basename, extname } from 'node:path'
import { readFile, stat } from 'node:fs/promises'
import type { Textbook, TextbookMetadata } from '../../shared/schemas/textbook'
import {
  IpcCreateTextbookFromTextInputSchema,
  IpcDeleteTextbookInputSchema,
  IpcGetTextbookInputSchema,
  IpcGetTextbookPageInputSchema
} from '../../shared/schemas/ipc'
import {
  TEXTBOOKS_CLEANUP_ORPHANS,
  TEXTBOOKS_CREATE_FROM_TEXT,
  TEXTBOOKS_DELETE,
  TEXTBOOKS_GET,
  TEXTBOOKS_GET_PAGE,
  TEXTBOOKS_IMPORT_FILE,
  TEXTBOOKS_LIST,
  TEXTBOOKS_LIST_ORPHANS
} from '../../shared/channel-names'
import { DEFAULT_WORLD_ID } from '../storage/app-data'
import {
  MAX_IMPORT_BYTES,
  parseImportFile
} from '../textbooks/importers/parse-file'
import {
  createTextbookFromFile,
  createTextbookFromText,
  deleteOrphanTextbookDirs,
  deleteTextbook,
  getTextbook,
  getTextbookPage,
  listOrphanTextbookDirs,
  listTextbooks
} from '../textbooks/textbook-store'

// ---------------------------------------------------------------
// IPC registration
// ---------------------------------------------------------------

export interface RegisterTextbookIpcOptions {
  textbookDir: string
  /** Parent window for the native import dialog (null in tests). */
  getWindow?: () => BrowserWindow | null
}

export function registerTextbookIpc(options: RegisterTextbookIpcOptions): void {
  const { textbookDir, getWindow } = options

  ipcMain.handle(
    TEXTBOOKS_CREATE_FROM_TEXT,
    async (_event, input: unknown): Promise<Textbook> => {
      const parsed = IpcCreateTextbookFromTextInputSchema.parse(input)
      return createTextbookFromText(textbookDir, {
        worldId: DEFAULT_WORLD_ID,
        title: parsed.title,
        format: parsed.format,
        content: parsed.content
      })
    }
  )

  ipcMain.handle(
    TEXTBOOKS_LIST,
    async (): Promise<TextbookMetadata[]> => listTextbooks(textbookDir)
  )

  ipcMain.handle(
    TEXTBOOKS_GET,
    async (_event, input: unknown): Promise<Textbook> => {
      const parsed = IpcGetTextbookInputSchema.parse(input)
      return getTextbook(textbookDir, parsed.textbookId)
    }
  )

  ipcMain.handle(
    TEXTBOOKS_DELETE,
    async (_event, input: unknown): Promise<void> => {
      const parsed = IpcDeleteTextbookInputSchema.parse(input)
      await deleteTextbook(textbookDir, parsed.textbookId)
    }
  )

  ipcMain.handle(TEXTBOOKS_GET_PAGE, async (_event, input: unknown) => {
    const parsed = IpcGetTextbookPageInputSchema.parse(input)
    return getTextbookPage(textbookDir, parsed.textbookId, parsed.page)
  })

  ipcMain.handle(TEXTBOOKS_LIST_ORPHANS, async (): Promise<string[]> => {
    return listOrphanTextbookDirs(textbookDir)
  })

  ipcMain.handle(TEXTBOOKS_CLEANUP_ORPHANS, async (): Promise<number> => {
    return deleteOrphanTextbookDirs(textbookDir)
  })

  // --- textbooks:import-file (F27/F28/F29) ---

  ipcMain.handle(
    TEXTBOOKS_IMPORT_FILE,
    async (): Promise<Textbook | null> => {
      const parent = getWindow?.() ?? null
      const dialogOptions: OpenDialogOptions = {
        title: '导入教材',
        properties: ['openFile'],
        filters: [
          {
            name: '教材文件',
            extensions: ['md', 'markdown', 'txt', 'pdf', 'epub', 'docx']
          }
        ]
      }

      const picked =
        parent === null
          ? await dialog.showOpenDialog(dialogOptions)
          : await dialog.showOpenDialog(parent, dialogOptions)
      if (picked.canceled || picked.filePaths.length === 0) return null

      const filePath = picked.filePaths[0]
      const info = await stat(filePath)
      if (info.size > MAX_IMPORT_BYTES) {
        throw new Error('文件过大（上限 100MB）')
      }

      const buffer = await readFile(filePath)
      const parsed = await parseImportFile(filePath, buffer)
      const title =
        parsed.title !== null && parsed.title.trim().length > 0
          ? parsed.title
          : basename(filePath, extname(filePath))

      return createTextbookFromFile(textbookDir, {
        worldId: DEFAULT_WORLD_ID,
        title,
        format: parsed.format,
        text: parsed.document.text,
        pages: parsed.document.pages,
        totalPages: parsed.document.totalPages,
        originalFileName: basename(filePath),
        originalData: buffer
      })
    }
  )
}
