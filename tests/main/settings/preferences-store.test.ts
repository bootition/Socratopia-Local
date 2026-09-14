/**
 * Tests for PreferencesStore — plain-JSON non-secret app preferences.
 */
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { describe, it, expect, afterAll } from 'vitest'

import { PreferencesStore } from '../../../src/main/settings/preferences-store'
import {
  DEFAULT_PREFERENCES,
  ChatModel,
  ReasoningEffort,
  TeachingPace,
  ThemeMode
} from '../../../src/shared/schemas/preferences'

const cleanupDirs: string[] = []

async function createTempDir(): Promise<string> {
  const dir = join(tmpdir(), `socratopia-prefs-${randomUUID()}`)
  await mkdir(dir, { recursive: true })
  cleanupDirs.push(dir)
  return dir
}

afterAll(async () => {
  await Promise.all(cleanupDirs.map((d) => rm(d, { recursive: true, force: true })))
})

describe('PreferencesStore', () => {
  it('returns defaults when no preferences file exists', async () => {
    const store = new PreferencesStore(await createTempDir())
    expect(await store.get()).toEqual(DEFAULT_PREFERENCES)
  })

  it('persists a partial update and returns the merged result', async () => {
    const root = await createTempDir()
    const store = new PreferencesStore(root)

    const updated = await store.update({
      model: ChatModel.Flash,
      pace: TeachingPace.Slow,
      reasoningEffort: ReasoningEffort.Off
    })

    expect(updated.model).toBe(ChatModel.Flash)
    expect(updated.pace).toBe(TeachingPace.Slow)
    expect(updated.reasoningEffort).toBe(ReasoningEffort.Off)
    // Untouched fields keep their defaults
    expect(updated.narrationEnabled).toBe(DEFAULT_PREFERENCES.narrationEnabled)
    expect(updated.theme).toBe(ThemeMode.Dark)

    // A new store instance reads the persisted file
    const reloaded = await new PreferencesStore(root).get()
    expect(reloaded).toEqual(updated)
  })

  it('writes plain readable JSON', async () => {
    const root = await createTempDir()
    const store = new PreferencesStore(root)
    await store.update({ theme: ThemeMode.Light })

    const raw = await readFile(join(root, 'config', 'preferences.json'), 'utf-8')
    expect(JSON.parse(raw).theme).toBe('light')
  })

  it('falls back per-field when the file is partially invalid', async () => {
    const root = await createTempDir()
    await mkdir(join(root, 'config'), { recursive: true })
    await writeFile(
      join(root, 'config', 'preferences.json'),
      JSON.stringify({ model: 'not-a-model', narrationEnabled: false }),
      'utf-8'
    )

    const prefs = await new PreferencesStore(root).get()
    expect(prefs.model).toBe(DEFAULT_PREFERENCES.model)
    expect(prefs.narrationEnabled).toBe(false)
  })

  it('falls back to defaults when the file is not valid JSON', async () => {
    const root = await createTempDir()
    await mkdir(join(root, 'config'), { recursive: true })
    await writeFile(join(root, 'config', 'preferences.json'), '{broken', 'utf-8')

    expect(await new PreferencesStore(root).get()).toEqual(DEFAULT_PREFERENCES)
  })

  it('rejects an invalid patch instead of writing it', async () => {
    const store = new PreferencesStore(await createTempDir())
    await expect(
      store.update({ model: 'gpt-4' as never })
    ).rejects.toThrow()
  })

  it('serializes concurrent updates without dropping fields', async () => {
    const store = new PreferencesStore(await createTempDir())

    await Promise.all([
      store.update({ model: ChatModel.Flash }),
      store.update({ pace: TeachingPace.Slow })
    ])

    const prefs = await store.get()
    expect(prefs.model).toBe(ChatModel.Flash)
    expect(prefs.pace).toBe(TeachingPace.Slow)
  })
})
