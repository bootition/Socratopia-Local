import { describe, it, expect, afterAll } from 'vitest'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

import type { SafeStorageAdapter } from '../../../src/main/security/secure-key-store'
import { SecureKeyStore } from '../../../src/main/security/secure-key-store'
import { configDir } from '../../../src/main/storage/app-data'

const TEST_ID = `socratopia-securekey-${randomUUID()}`
const tempDir = join(tmpdir(), TEST_ID)

const ALGORITHM = 'aes-256-cbc'
const TEST_KEY = Buffer.from(
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  'hex'
)

function createTestAdapter(): SafeStorageAdapter {
  return {
    isEncryptionAvailable: () => true,
    encryptString(plaintext: string): Buffer {
      const iv = randomBytes(16)
      const cipher = createCipheriv(ALGORITHM, TEST_KEY, iv)
      const encrypted = Buffer.concat([
        cipher.update(plaintext, 'utf8'),
        cipher.final()
      ])
      return Buffer.concat([iv, encrypted])
    },
    decryptString(encrypted: Buffer): string {
      const iv = encrypted.subarray(0, 16)
      const data = encrypted.subarray(16)
      const decipher = createDecipheriv(ALGORITHM, TEST_KEY, iv)
      const decrypted = Buffer.concat([
        decipher.update(data),
        decipher.final()
      ])
      return decrypted.toString('utf8')
    }
  }
}

let testIdx = 0
/** Tracks the dataRoot of the most recently created store, for file inspection tests */
let lastDataRoot = ''

function createStore(): SecureKeyStore {
  testIdx++
  const root = join(tempDir, `test_${testIdx}`)
  lastDataRoot = root
  return new SecureKeyStore(root, createTestAdapter())
}

afterAll(async () => {
  const { rm } = await import('node:fs/promises')
  await rm(tempDir, { recursive: true, force: true })
})

// ============================================================
// hasKey()
// ============================================================
describe('hasKey', () => {
  it('returns false when no key has been stored', async () => {
    const store = createStore()
    expect(await store.hasKey()).toBe(false)
  })

  it('returns true after setKey', async () => {
    const store = createStore()
    await store.setKey('sk-test-key-12345')
    expect(await store.hasKey()).toBe(true)
  })

  it('returns false after deleteKey on existing key', async () => {
    const store = createStore()
    await store.setKey('sk-test-key-67890')
    await store.deleteKey()
    expect(await store.hasKey()).toBe(false)
  })
})

// ============================================================
// setKey()
// ============================================================
describe('setKey', () => {
  it('stores key and readKey returns it', async () => {
    const store = createStore()
    await store.setKey('sk-test-key-abcde')
    const result = await store.readKey()
    expect(result).toBe('sk-test-key-abcde')
  })

  it('overwrites existing key', async () => {
    const store = createStore()
    await store.setKey('sk-old-key')
    await store.setKey('sk-new-key')
    const result = await store.readKey()
    expect(result).toBe('sk-new-key')
  })

  it('throws when key is empty string', async () => {
    const store = createStore()
    await expect(store.setKey('')).rejects.toThrow()
  })

  it('throws when key is whitespace only', async () => {
    const store = createStore()
    await expect(store.setKey('   ')).rejects.toThrow()
  })
})

// ============================================================
// readKey()
// ============================================================
describe('readKey', () => {
  it('returns null when no key has been stored', async () => {
    const store = createStore()
    const result = await store.readKey()
    expect(result).toBeNull()
  })

  it('returns the exact stored key', async () => {
    const store = createStore()
    const longKey = 'sk-' + 'a'.repeat(64)
    await store.setKey(longKey)
    const result = await store.readKey()
    expect(result).toBe(longKey)
  })

  it('returns null after deleteKey', async () => {
    const store = createStore()
    await store.setKey('sk-test')
    await store.deleteKey()
    const result = await store.readKey()
    expect(result).toBeNull()
  })
})

// ============================================================
// deleteKey()
// ============================================================
describe('deleteKey', () => {
  it('does not throw when no key exists (idempotent)', async () => {
    const store = createStore()
    await expect(store.deleteKey()).resolves.toBeUndefined()
  })

  it('calling deleteKey twice does not throw', async () => {
    const store = createStore()
    await store.setKey('sk-test')
    await store.deleteKey()
    await expect(store.deleteKey()).resolves.toBeUndefined()
  })
})

// ============================================================
// Encryption Security
// ============================================================
describe('encryption security', () => {
  it('stored file does not contain plaintext key', async () => {
    const store = createStore()
    const secretKey = 'sk-secret-key-7a3b2c1d-4e5f-6a7b-8c9d'
    await store.setKey(secretKey)

    const keyFilePath = join(configDir(lastDataRoot), 'deepseek-key.enc')
    const rawBytes: Buffer = await readFile(keyFilePath)
    const rawString = rawBytes.toString('utf8')

    expect(rawString).not.toContain(secretKey)
    expect(rawString).not.toContain('sk-')
  })

  it('stored file is not valid UTF-8 JSON', async () => {
    const store = createStore()
    await store.setKey('sk-test-key-json-check')

    const keyFilePath = join(configDir(lastDataRoot), 'deepseek-key.enc')
    const rawBytes: Buffer = await readFile(keyFilePath)

    // Attempt to parse as JSON — should fail
    expect(() => JSON.parse(rawBytes.toString('utf8'))).toThrow()
  })

  it('two stores of the same key produce different encrypted files', async () => {
    const store1 = createStore()
    const store2 = createStore()
    const sameKey = 'sk-same-key-value'

    await store1.setKey(sameKey)
    await store2.setKey(sameKey)

    // Get the dataRoot for each
    const root1 = join(tempDir, `test_${testIdx - 1}`)
    const root2 = join(tempDir, `test_${testIdx}`)

    const file1 = await readFile(join(configDir(root1), 'deepseek-key.enc'))
    const file2 = await readFile(join(configDir(root2), 'deepseek-key.enc'))

    // Different IV means different ciphertext
    expect(file1.equals(file2)).toBe(false)
  })
})
