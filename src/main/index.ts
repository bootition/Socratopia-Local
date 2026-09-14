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
    minWidth: 960,
    minHeight: 640,
    title: 'Socratopia-Local',
    backgroundColor: '#0f172a',
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
    // Only hand web links to the OS browser; deny everything else.
    if (isExternalLink(details.url)) {
      void shell.openExternal(details.url)
    }
    return { action: 'deny' }
  })

  // Never let the app window navigate away from our own renderer.
  // A malicious link (or injected Markdown) must not replace the app
  // with an arbitrary page that still has the preload bridge attached.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isRendererUrl(url)) return
    event.preventDefault()
    if (isExternalLink(url)) {
      void shell.openExternal(url)
    }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

/**
 * A small Chinese application menu: standard editing shortcuts, zoom,
 * the data directory and an About box. Without it Electron shows its
 * English developer menu, which is confusing for learners.
 */
function createApplicationMenu(dataRoot: string): void {
  const template: MenuItemConstructorOptions[] = [
    {
      label: '文件',
      submenu: [{ role: 'quit', label: '退出 Socratopia-Local' }]
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' }
      ]
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '重新加载' },
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏' }
      ]
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '打开数据目录',
          click: () => {
            void shell.openPath(dataRoot)
          }
        },
        {
          label: '关于 Socratopia-Local',
          click: () => {
            void dialog.showMessageBox({
              type: 'info',
              title: '关于 Socratopia-Local',
              message: `Socratopia-Local ${app.getVersion()}`,
              detail: [
                '本地优先的 AI 苏格拉底式学习伴侣。',
                '',
                `数据目录：${dataRoot}`,
                `Electron ${process.versions.electron} · Chrome ${process.versions.chrome}`
              ].join('\n')
            })
          }
        }
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// A second instance would share the same data directory and could
// overwrite index.json / preferences / textbook metadata.
const hasSingleInstanceLock = app.requestSingleInstanceLock()
const selfTestOutPath = process.env['SOCRATOPIA_SELF_TEST_OUT']
// Windows taskbar grouping / notifications identity.
app.setAppUserModelId('app.socratopia.local')

if (selfTestOutPath !== undefined && selfTestOutPath.length > 0) {
  // Headless packaged self-test (packaging verification, no key needed).
  /**
 * A small Chinese application menu: standard editing shortcuts, zoom,
 * the data directory and an About box. Without it Electron shows its
 * English developer menu, which is confusing for learners.
 */
function createApplicationMenu(dataRoot: string): void {
  const template: MenuItemConstructorOptions[] = [
    {
      label: '文件',
      submenu: [{ role: 'quit', label: '退出 Socratopia-Local' }]
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' }
      ]
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '重新加载' },
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏' }
      ]
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '打开数据目录',
          click: () => {
            void shell.openPath(dataRoot)
          }
        },
        {
          label: '关于 Socratopia-Local',
          click: () => {
            void dialog.showMessageBox({
              type: 'info',
              title: '关于 Socratopia-Local',
              message: `Socratopia-Local ${app.getVersion()}`,
              detail: [
                '本地优先的 AI 苏格拉底式学习伴侣。',
                '',
                `数据目录：${dataRoot}`,
                `Electron ${process.versions.electron} · Chrome ${process.versions.chrome}`
              ].join('\n')
            })
          }
        }
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

app.whenReady().then(async () => {
    const referenceBase = app.isPackaged ? process.resourcesPath : app.getAppPath()
    try {
      const report = await runSelfTest(selfTestOutPath, referenceBase)
      app.exit(report.ok ? 0 : 1)
    } catch (err: unknown) {
      console.error('[self-test] crashed:', err)
      app.exit(2)
    }
  })
} else if (!hasSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const existing = BrowserWindow.getAllWindows()[0]
    if (existing !== undefined) {
      if (existing.isMinimized()) existing.restore()
      existing.focus()
    }
  })

  app.whenReady().then(async () => {
  const dataRoot = join(app.getPath('userData'), 'Socratopia-Local')
  // In a packaged app the reference corpus is shipped via
  // extraResources (resources/reference); in dev it lives in the repo.
  const referenceBase = app.isPackaged ? process.resourcesPath : app.getAppPath()
  const { candidatesDir, worldPresetPath } = resolveReferencePaths(referenceBase)

  // Initialize local data layout (idempotent — safe to call on every start).
  // A failure here (missing reference corpus, read-only disk) must not
  // prevent the window from opening: the IPC layer still works and the
  // UI can show actionable errors.
  try {
    await initDataDir({
      dataRoot,
      referenceDir: candidatesDir,
      worldPresetPath
    })
  } catch (err: unknown) {
    console.error(
      '[init] local data initialization failed:',
      err instanceof Error ? err.message : err
    )
  }

  // Register IPC handlers that don't need the window
  ipcMain.handle('app:get-version', () => app.getVersion())
  ipcMain.handle('app:get-platform', () => process.platform)
  const { keyStore, preferencesStore } = registerSettingsIpc(dataRoot, safeStorage)

  createApplicationMenu(dataRoot)
  createWindow()

  // Register chat streaming IPC (needs window reference + key store)
  registerChatStreamIpc(
    () => {
      const win = BrowserWindow.getAllWindows()[0]
      if (!win) throw new Error('No BrowserWindow available')
      return win.webContents
    },
    (params) => createDeepSeekStreamAdapter().streamChat(params),
    () => keyStore.readKey(),
    () => preferencesStore.get(),
    createPromptRequestBuilder({
      companionDir: companionDir(dataRoot),
      textbookDir: textbookDir(dataRoot),
      conversationDir: conversationDir(dataRoot),
      storyPath: storyPath(dataRoot),
      learnerPath: learnerPath(dataRoot)
    }),
    (usage) => {
      void usageStore
        .record({
          timestamp: new Date().toISOString(),
          model: usage.model,
          conversationId: usage.conversationId,
          promptTokens: usage.promptTokens,
          completionTokens: usage.completionTokens,
          totalTokens: usage.totalTokens
        })
        .catch(() => {
          // Usage logging must never break a lesson.
        })
    }
  )

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
  }).catch((err: unknown) => {
    console.error(
      '[startup] initialization failed:',
      err instanceof Error ? err.stack ?? err.message : err
    )
    // Still open a window if none exists: a broken data directory should
    // show the app (and its errors) instead of silently doing nothing.
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
}

process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

/** http(s)/mailto links may be opened in the user's browser. */
function isExternalLink(url: string): boolean {
  return /^https?:\/\//.test(url) || url.startsWith('mailto:')
}

/** The app's own renderer (packaged file:// or the dev server). */
function isRendererUrl(url: string): boolean {
  if (url.startsWith('file://')) return true
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  return devUrl !== undefined && devUrl.length > 0 && url.startsWith(devUrl)
}
