import { readFile, writeFile, unlink, access, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { configDir } from '../storage/app-data'

/**
 * Dependency-injected abstraction over platform-specific encryption.
 *
 * In production this wraps Electron's `safeStorage` module.
 * Tests inject a Node.js `crypto`-based adapter so they run
 * without the Electron runtime.
 */
export interface SafeStorageAdapter {
  /** Returns true when OS-level encryption is available */
  isEncryptionAvailable(): boolean
  /** Encrypt a plaintext string, returning a raw encrypted Buffer */
  encryptString(plaintext: string): Buffer
  /** Decrypt an encrypted Buffer, returning the original plaintext */
  decryptString(encrypted: Buffer): string
}

const KEY_FILE_NAME = 'deepseek-key.enc'

/**
 * Persists the DeepSeek API key as an encrypted binary blob under
 * `{dataRoot}/config/deepseek-key.enc`.
 *
 * The plaintext key never appears in the file system and is never
 * exposed to the renderer process.
 */
export class SecureKeyStore {
  constructor(
    private readonly dataRoot: string,
    private readonly safeStorage: SafeStorageAdapter
  ) {}

  private get keyFilePath(): string {
    return join(configDir(this.dataRoot), KEY_FILE_NAME)
  }

  /**
   * Returns true only when a key file exists AND can actually be
   * decrypted into a non-empty key.
   *
   * A file that exists but cannot be decrypted (corrupted file, copied
   * profile from another machine, changed OS keychain) must not be
   * reported as "configured": otherwise the UI would claim a key is
   * present while every chat request fails with "API key not
   * configured". Returning false sends the user back to the setup gate
   * where they can re-enter the key.
   */
  async hasKey(): Promise<boolean> {
    try {
      await access(this.keyFilePath)
    } catch {
      return false
    }

    const key = await this.readKey()
    return key !== null && key.trim().length > 0
  }

  /**
   * Encrypts and persists the API key.
   * Throws if the key is empty or whitespace-only.
   */
  async setKey(apiKey: string): Promise<void> {
    if (apiKey.trim().length === 0) {
      throw new Error('API key must not be empty')
    }
    // Keys are sent as an HTTP header value. Newlines/NUL would make
    // undici include the whole key in its TypeError message, which could
    // leak it into the UI — and they are never valid in a DeepSeek key.
    if (!/^[\x21-\x7e]{1,200}$/.test(apiKey)) {
      throw new Error('API Key 格式不正确（应为 1-200 个可见字符，不含空格和换行）')
    }

    if (!this.safeStorage.isEncryptionAvailable()) {
      throw new Error('Encryption is not available on this system')
    }

    await mkdir(configDir(this.dataRoot), { recursive: true })

    const encrypted = this.safeStorage.encryptString(apiKey)
    await writeFile(this.keyFilePath, encrypted)
  }

  /**
   * Reads and decrypts the stored API key.
   * Returns null when no key has been stored.
   */
  async readKey(): Promise<string | null> {
    try {
      const encrypted = await readFile(this.keyFilePath)
      return this.safeStorage.decryptString(encrypted)
    } catch {
      return null
    }
  }

  /**
   * Deletes the encrypted key file.
   * Idempotent — does not throw when the file is already absent.
   */
  async deleteKey(): Promise<void> {
    try {
      await unlink(this.keyFilePath)
    } catch {
      // File doesn't exist — that's fine
    }
  }
}
