import { app, BrowserWindow, ipcMain, shell, safeStorage } from 'electron'
import { join } from 'path'
import { registerSettingsIpc } from './ipc/settings'
import { registerChatStreamIpc } from './ipc/chat-stream'
import { initDataDir } from './storage/initialize'
import { resolveReferencePaths } from './storage/resolve-paths'
import { createDeepSeekStreamAdapter } from './llm/deepseek-stream-adapter'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  const dataRoot = join(app.getPath('userData'), 'Socratopia-Local')
  const { candidatesDir, worldPresetPath } = resolveReferencePaths(app.getAppPath())

  // Initialize local data layout (idempotent — safe to call on every start)
  await initDataDir({
    dataRoot,
    referenceDir: candidatesDir,
    worldPresetPath
  })

  // Register IPC handlers that don't need the window
  ipcMain.handle('app:get-version', () => app.getVersion())
  ipcMain.handle('app:get-platform', () => process.platform)
  const keyStore = registerSettingsIpc(dataRoot, safeStorage)

  createWindow()

  // Register chat streaming IPC (needs window reference + key store)
  registerChatStreamIpc(
    () => {
      const win = BrowserWindow.getAllWindows()[0]
      if (!win) throw new Error('No BrowserWindow available')
      return win.webContents
    },
    (params) => createDeepSeekStreamAdapter().streamChat(params),
    () => keyStore.readKey()
  )

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
