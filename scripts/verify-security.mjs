// Security baseline verification for Milestone 0 Task 2
// Checks preload exposes ONLY window.socratopia, and main process enforces secure settings.

import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

let passed = 0
let failed = 0

function check(name, condition, detail) {
  if (condition) {
    console.log(`  \x1b[32m✓\x1b[0m ${name}`)
    passed++
  } else {
    console.log(`  \x1b[31m✗\x1b[0m ${name}${detail ? ` — ${detail}` : ''}`)
    failed++
  }
}

// ── Preload security ────────────────────────────────────────────
console.log('\nPreload Security Checks (src/preload/index.ts):')
const preloadSrc = readFileSync(resolve(root, 'src/preload/index.ts'), 'utf-8')

check('contextBridge.exposeInMainWorld present', preloadSrc.includes('contextBridge.exposeInMainWorld'))
check('Exposes only "socratopia" namespace', preloadSrc.includes("exposeInMainWorld('socratopia'"), 'single bridge entry-point required')
check('Does NOT expose raw ipcRenderer', !preloadSrc.includes("exposeInMainWorld('ipcRenderer'"))
check('Does NOT expose raw fs module', !preloadSrc.includes("exposeInMainWorld('fs'"))
check('Does NOT expose raw shell module', !preloadSrc.includes("exposeInMainWorld('shell'"))
check('Does NOT expose raw process global', !preloadSrc.includes("exposeInMainWorld('process'"))
check('Does NOT expose raw electron module', !preloadSrc.includes("exposeInMainWorld('electron'"))
check('Does NOT expose getDeepSeekKey API', !preloadSrc.includes('getDeepSeekKey'), 'plaintext key must never be readable from renderer')
check('Does NOT expose getKey API', !preloadSrc.includes('getKey'), 'plaintext key must never be readable from renderer')
check('Does NOT expose readKey API', !preloadSrc.includes('readKey'), 'plaintext key must never be readable from renderer')
check('Exposes hasDeepSeekKey', preloadSrc.includes('hasDeepSeekKey'), 'settings API required')
check('Exposes setDeepSeekKey', preloadSrc.includes('setDeepSeekKey'), 'settings API required')
check('Exposes deleteDeepSeekKey', preloadSrc.includes('deleteDeepSeekKey'), 'settings API required')

// ── Main process security ───────────────────────────────────────
console.log('\nMain Process Security Checks (src/main/index.ts):')
const mainSrc = readFileSync(resolve(root, 'src/main/index.ts'), 'utf-8')

check('contextIsolation: true', mainSrc.includes('contextIsolation: true'), 'renderer must not share JS context with preload')
check('nodeIntegration: false', mainSrc.includes('nodeIntegration: false'), 'renderer must not have Node.js access')
check('sandbox: true', mainSrc.includes('sandbox: true'), 'renderer must run in OS-level sandbox')
check('Blocks in-window navigation (will-navigate)', mainSrc.includes("'will-navigate'"), 'external pages must not replace the app renderer')
check('Validates external link protocols', mainSrc.includes('isExternalLink'), 'only http(s)/mailto links may reach shell.openExternal')

// ── Settings IPC security ──────────────────────────────────────
console.log('\nSettings IPC Security Checks (src/main/ipc/settings.ts):')
const settingsIpcSrc = readFileSync(resolve(root, 'src/main/ipc/settings.ts'), 'utf-8')

check('Settings IPC validates set-key with schema', settingsIpcSrc.includes('IpcSetDeepSeekKeyInputSchema'), 'Zod validation required on IPC boundary')
check('Settings IPC does not expose readKey channel', !settingsIpcSrc.includes("settings:get-deepseek-key"), 'plaintext key must never leave main process')
check('Settings IPC does not expose get-key channel', !settingsIpcSrc.includes("settings:read-deepseek-key"), 'plaintext key must never leave main process')

// ── Renderer isolation ──────────────────────────────────────────
console.log('\nRenderer Isolation Checks (src/renderer/src/App.tsx):')
const rendererRoot = resolve(root, 'src/renderer/src')
const appSrc = readdirSync(rendererRoot, { recursive: true })
  .filter((entry) => /\.(ts|tsx)$/.test(String(entry)) && !String(entry).endsWith('.d.ts'))
  .map((entry) => readFileSync(join(rendererRoot, String(entry)), 'utf-8'))
  .join(String.fromCharCode(10))

check('No Node fs import in renderer', !appSrc.includes("require('fs')") && !appSrc.includes("from 'fs'"))
check('No ipcRenderer import in renderer', !appSrc.includes('ipcRenderer'))
check('No electron import in renderer', !appSrc.includes("require('electron')") && !appSrc.includes("from 'electron'"))
check('Renderer uses window.socratopia only', appSrc.includes('window.socratopia'), 'renderer must only access the typed bridge')

// ── Preload type declaration ────────────────────────────────────
console.log('\nType Declaration Checks (src/preload/index.d.ts):')
const preloadDeclSrc = readFileSync(resolve(root, 'src/preload/index.d.ts'), 'utf-8')

check('Augments global Window interface', preloadDeclSrc.includes('interface Window'))
check('Declares window.socratopia type', preloadDeclSrc.includes('socratopia:'))

// ── Chat Stream IPC Security ────────────────────────────────────
console.log('\nChat Stream IPC Security Checks (src/main/ipc/chat-stream.ts):')

let streamIpcSrc
try {
  streamIpcSrc = readFileSync(resolve(root, 'src/main/ipc/chat-stream.ts'), 'utf-8')
} catch {
  streamIpcSrc = ''
}

if (streamIpcSrc.length > 0) {
  check('Chat stream IPC validates input with Zod schema', streamIpcSrc.includes('.parse('), 'Zod validation required on IPC boundary')
  check('Chat stream IPC does not expose readKey or getKey channel', !streamIpcSrc.includes("settings:get") && !streamIpcSrc.includes("settings:read"), 'API key must never leave main process')
  check('Chat stream IPC has session cleanup on completion', streamIpcSrc.includes('sessions.delete'), 'sessions must be cleaned up to prevent memory leaks')
} else {
  check('Chat stream IPC file exists', false, 'src/main/ipc/chat-stream.ts not found')
}

// ── Preload Chat API Security ───────────────────────────────────
console.log('\nPreload Chat API Checks (src/preload/index.ts):')
check('Preload exposes startStream API', preloadSrc.includes('startStream'), 'chat API required')
check('Preload exposes cancelStream API', preloadSrc.includes('cancelStream'), 'chat API required')
check('Preload exposes onToken API', preloadSrc.includes('onToken'), 'chat API required')
check('Preload exposes onError API', preloadSrc.includes('onError'), 'chat API required')
check('Preload exposes onEnd API', preloadSrc.includes('onEnd'), 'chat API required')
check('Preload exposes onUsage API', preloadSrc.includes('onUsage'), 'chat API required')
check('Preload does NOT expose raw ipcRenderer.on for chat channels', !preloadSrc.includes("ipcRenderer.on('chat:"), 'renderer must not directly subscribe to IPC channels')
check('Preload does NOT expose getKey or readKey in chat API', !preloadSrc.includes('readKey'), 'plaintext key must never be readable from renderer')

// ── Summary ─────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}`)
console.log(`Results: ${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log('\x1b[31mSECURITY BASELINE FAILED\x1b[0m')
  process.exit(1)
} else {
  console.log('\x1b[32mSECURITY BASELINE PASSED\x1b[0m')
}
