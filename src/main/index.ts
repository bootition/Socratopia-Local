import { app, BrowserWindow, ipcMain, shell, safeStorage } from 'electron'
import { join } from 'path'
import { registerSettingsIpc } from './ipc/settings'
import { initDataDir } from './storage/initialize'
import { resolveReferencePaths } from './storage/resolve-paths'

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

function registerIpcHandlers(dataRoot: string): void {
  ipcMain.handle('app:get-version', () => app.getVersion())
  ipcMain.handle('app:get-platform', () => process.platform)

  registerSettingsIpc(dataRoot, safeStorage)
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

  registerIpcHandlers(dataRoot)
  createWindow()

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
