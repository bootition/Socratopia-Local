import { ipcMain } from 'electron'
import { SecureKeyStore, type SafeStorageAdapter } from '../security/secure-key-store'
import { IpcSetDeepSeekKeyInputSchema } from '../../shared/schemas/ipc'

function createElectronSafeStorageAdapter(safeStorage: Electron.SafeStorage): SafeStorageAdapter {
  return {
    isEncryptionAvailable: () => safeStorage.isEncryptionAvailable(),
    encryptString: (plaintext: string) => safeStorage.encryptString(plaintext),
    decryptString: (encrypted: Buffer) => safeStorage.decryptString(encrypted)
  }
}

/**
 * Register IPC handlers for settings-related operations.
 *
 * Exposes only three capability channels to the renderer:
 * - `settings:has-deepseek-key`  → boolean
 * - `settings:set-deepseek-key`  → void  (input validated with Zod)
 * - `settings:delete-deepseek-key` → void
 *
 * The raw plaintext key is **never** returned to the renderer.
 */
export function registerSettingsIpc(
  dataRoot: string,
  safeStorage: Electron.SafeStorage
): SecureKeyStore {
  const adapter = createElectronSafeStorageAdapter(safeStorage)
  const store = new SecureKeyStore(dataRoot, adapter)

  ipcMain.handle('settings:has-deepseek-key', async () => {
    return store.hasKey()
  })

  ipcMain.handle('settings:set-deepseek-key', async (_event, input: unknown) => {
    const parsed = IpcSetDeepSeekKeyInputSchema.parse(input)
    await store.setKey(parsed.key)
  })

  ipcMain.handle('settings:delete-deepseek-key', async () => {
    await store.deleteKey()
  })

  return store
}
