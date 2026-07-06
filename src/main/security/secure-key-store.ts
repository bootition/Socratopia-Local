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

  /** Returns true if an encrypted key file exists on disk */
  async hasKey(): Promise<boolean> {
    try {
      await access(this.keyFilePath)
      return true
    } catch {
      return false
    }
  }

  /**
   * Encrypts and persists the API key.
   * Throws if the key is empty or whitespace-only.
   */
  async setKey(apiKey: string): Promise<void> {
    if (apiKey.trim().length === 0) {
      throw new Error('API key must not be empty')
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
