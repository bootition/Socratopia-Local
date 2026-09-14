/**
 * Local archive IPC (F17): export/restore the whole data directory via
 * native directory pickers, and open the data folder in the OS file
 * manager. All filesystem access stays in the main process.
 */

import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import {
  ARCHIVE_EXPORT,
  ARCHIVE_OPEN_FOLDER,
  ARCHIVE_RESTORE
} from '../../shared/channel-names'
import { exportDataArchive, restoreDataArchive } from '../archive/data-archive'

export interface RegisterArchiveIpcOptions {
  dataRoot: string
  getWindow: () => BrowserWindow | null
}

export function registerArchiveIpc(options: RegisterArchiveIpcOptions): void {
  const { dataRoot, getWindow } = options

  ipcMain.handle(ARCHIVE_EXPORT, async () => {
    const win = getWindow()
    const picked =
      win === null
        ? await dialog.showOpenDialog({
            title: '选择备份保存位置',
            properties: ['openDirectory', 'createDirectory']
          })
        : await dialog.showOpenDialog(win, {
            title: '选择备份保存位置',
            properties: ['openDirectory', 'createDirectory']
          })

    if (picked.canceled || picked.filePaths.length === 0) return null
    const path = await exportDataArchive(dataRoot, picked.filePaths[0])
    return { path }
  })

  ipcMain.handle(ARCHIVE_RESTORE, async () => {
    const win = getWindow()
    const picked =
      win === null
        ? await dialog.showOpenDialog({
            title: '选择要恢复的备份目录',
            properties: ['openDirectory']
          })
        : await dialog.showOpenDialog(win, {
            title: '选择要恢复的备份目录',
            properties: ['openDirectory']
          })

    if (picked.canceled || picked.filePaths.length === 0) return null
    await restoreDataArchive(picked.filePaths[0], dataRoot)
    return { path: picked.filePaths[0] }
  })

  ipcMain.handle(ARCHIVE_OPEN_FOLDER, async () => {
    await shell.openPath(dataRoot)
  })
}
