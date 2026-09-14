/**
 * IPC handlers for classroom notes & highlights (F05).
 */

import { ipcMain } from 'electron'
import {
  IpcCreateNoteInputSchema,
  IpcDeleteNoteInputSchema,
  IpcListNotesInputSchema,
  IpcUpdateNoteInputSchema
} from '../../shared/schemas/ipc'
import {
  NOTES_CREATE,
  NOTES_DELETE,
  NOTES_LIST,
  NOTES_UPDATE
} from '../../shared/channel-names'
import type { Note } from '../../shared/schemas/note'
import type { NoteStore } from '../notes/note-store'

export interface RegisterNoteIpcOptions {
  store: NoteStore
}

export function registerNoteIpc(options: RegisterNoteIpcOptions): void {
  const { store } = options

  ipcMain.handle(NOTES_LIST, async (_event, input: unknown): Promise<Note[]> => {
    const parsed = IpcListNotesInputSchema.parse(input ?? {})
    return store.list(parsed.conversationId)
  })

  ipcMain.handle(NOTES_CREATE, async (_event, input: unknown): Promise<Note> => {
    const parsed = IpcCreateNoteInputSchema.parse(input)
    return store.create(parsed)
  })

  ipcMain.handle(NOTES_UPDATE, async (_event, input: unknown): Promise<Note> => {
    const parsed = IpcUpdateNoteInputSchema.parse(input)
    return store.update(parsed.noteId, { text: parsed.text, color: parsed.color })
  })

  ipcMain.handle(NOTES_DELETE, async (_event, input: unknown): Promise<void> => {
    const parsed = IpcDeleteNoteInputSchema.parse(input)
    await store.delete(parsed.noteId)
  })
}
