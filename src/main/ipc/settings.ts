import { ipcMain } from 'electron'
import { SecureKeyStore, type SafeStorageAdapter } from '../security/secure-key-store'
import { PreferencesStore } from '../settings/preferences-store'
import {
  IpcSetDeepSeekKeyInputSchema,
  IpcTestDeepSeekKeyInputSchema
} from '../../shared/schemas/ipc'
import { AppPreferencesPatchSchema } from '../../shared/schemas/preferences'
import { DeepSeekClient } from '../llm/deepseek-client'
import { UsageStore } from '../settings/usage-store'
import { createDeepSeekHttpAdapter } from '../llm/deepseek-http-adapter'
import { AppError, describeDeepSeekError } from '../llm/errors'
import type { DeepSeekKeyTestResult } from '../../shared/schemas/settings'
import {
  SETTINGS_HAS_DEEPSEEK_KEY,
  SETTINGS_SET_DEEPSEEK_KEY,
  SETTINGS_DELETE_DEEPSEEK_KEY,
  SETTINGS_GET_PREFERENCES,
  SETTINGS_SET_PREFERENCES,
  SETTINGS_TEST_DEEPSEEK_KEY
} from '../../shared/channel-names'

function createElectronSafeStorageAdapter(safeStorage: Electron.SafeStorage): SafeStorageAdapter {
  return {
    isEncryptionAvailable: () => safeStorage.isEncryptionAvailable(),
    encryptString: (plaintext: string) => safeStorage.encryptString(plaintext),
    decryptString: (encrypted: Buffer) => safeStorage.decryptString(encrypted)
  }
}

export interface SettingsIpcHandles {
  keyStore: SecureKeyStore
  preferencesStore: PreferencesStore
}

/**
 * Register IPC handlers for settings-related operations.
 *
 * Key channels (renderer only gets capabilities, never the plaintext):
 * - `settings:has-deepseek-key`    → boolean
 * - `settings:set-deepseek-key`    → void  (input validated with Zod)
 * - `settings:delete-deepseek-key` → void
 *
 * Preferences channels (non-secret, plain JSON):
 * - `settings:get-preferences` → AppPreferences
 * - `settings:set-preferences` → AppPreferences (validated partial patch)
 */
export function registerSettingsIpc(
  dataRoot: string,
  safeStorage: Electron.SafeStorage
): SettingsIpcHandles {
  const adapter = createElectronSafeStorageAdapter(safeStorage)
  const keyStore = new SecureKeyStore(dataRoot, adapter)
  const preferencesStore = new PreferencesStore(dataRoot)
  const usageStore = new UsageStore(dataRoot)
  let keyTestInFlight: Promise<DeepSeekKeyTestResult> | null = null

  ipcMain.handle(SETTINGS_HAS_DEEPSEEK_KEY, async () => {
    return keyStore.hasKey()
  })

  ipcMain.handle(SETTINGS_SET_DEEPSEEK_KEY, async (_event, input: unknown) => {
    const parsed = IpcSetDeepSeekKeyInputSchema.parse(input)
    await keyStore.setKey(parsed.key)
  })

  ipcMain.handle(SETTINGS_DELETE_DEEPSEEK_KEY, async () => {
    await keyStore.deleteKey()
  })

  ipcMain.handle(SETTINGS_GET_PREFERENCES, async () => {
    return preferencesStore.get()
  })

  ipcMain.handle(SETTINGS_SET_PREFERENCES, async (_event, input: unknown) => {
    const patch = AppPreferencesPatchSchema.parse(input)
    return preferencesStore.update(patch)
  })

  ipcMain.handle(
    SETTINGS_TEST_DEEPSEEK_KEY,
    async (_event, input: unknown): Promise<DeepSeekKeyTestResult> => {
      if (keyTestInFlight !== null) return keyTestInFlight

      const parsedResult = IpcTestDeepSeekKeyInputSchema.safeParse(input ?? {})
      if (!parsedResult.success) {
        return {
          ok: false,
          code: 'INVALID_API_KEY',
          message: parsedResult.error.issues[0]?.message ?? 'API Key 格式不正确'
        }
      }
      const parsed = parsedResult.data
      const apiKey = parsed.key ?? (await keyStore.readKey())
      if (apiKey === null || apiKey.trim().length === 0) {
        return {
          ok: false,
          code: 'MISSING_API_KEY',
          message: '还没有配置 DeepSeek API Key。'
        }
      }

      keyTestInFlight = (async (): Promise<DeepSeekKeyTestResult> => {
        try {
          const preferences = await preferencesStore.get()
          const client = new DeepSeekClient(apiKey, createDeepSeekHttpAdapter())
          const response = await client.chat(
            [{ role: 'user', content: '请只回复两个字：连接' }],
            { model: preferences.model, maxTokens: 16 }
          )
          if (response.usage !== null && response.usage.totalTokens > 0) {
            void usageStore
              .record({
                timestamp: new Date().toISOString(),
                model: response.model,
                conversationId: null,
                promptTokens: response.usage.promptTokens,
                completionTokens: response.usage.completionTokens,
                totalTokens: response.usage.totalTokens
              })
              .catch(() => undefined)
          }
          return {
            ok: true,
            model: response.model,
            reply: response.content.slice(0, 50)
          }
        } catch (err: unknown) {
          return {
            ok: false,
            code: err instanceof AppError ? err.code : 'UNKNOWN_ERROR',
            message: describeDeepSeekError(err)
          }
        } finally {
          keyTestInFlight = null
        }
      })()
      return keyTestInFlight
    }
  )

  return { keyStore, preferencesStore }
}
