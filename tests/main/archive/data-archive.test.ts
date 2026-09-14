/**
 * Tests for local data archive & restore (F17).
 */
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'

import {
  exportDataArchive,
  restoreDataArchive
} from '../../../src/main/archive/data-archive'

const cleanupDirs: string[] = []

async function createTempDir(): Promise<string> {
  const dir = join(tmpdir(), `socratopia-archive-${randomUUID()}`)
  await rm(dir, { recursive: true, force: true })
  await mkdir(dir, { recursive: true })
  cleanupDirs.push(dir)
  return dir
}

afterAll(async () => {
  await Promise.all(cleanupDirs.map((d) => rm(d, { recursive: true, force: true })))
})

async function seedDataRoot(root: string): Promise<void> {
  await mkdir(join(root, 'config'), { recursive: true })
  await mkdir(join(root, 'profiles', 'prof_default'), { recursive: true })
  await writeFile(join(root, 'config', 'preferences.json'), '{"model":"deepseek-v4-pro"}', 'utf-8')
}

describe('exportDataArchive', () => {
  it('copies the data root into a timestamped backup folder', async () => {
    const workDir = await createTempDir()
    const dataRoot = join(workDir, 'data')
    const backupParent = join(workDir, 'backups')
    await seedDataRoot(dataRoot)
    await mkdir(backupParent, { recursive: true })

    const target = await exportDataArchive(dataRoot, backupParent, new Date('2026-09-14T10:20:30'))

    expect(target).toBe(join(backupParent, 'Socratopia-Local-backup-20260914-102030'))
    expect(
      await readFile(join(target, 'config', 'preferences.json'), 'utf-8')
    ).toContain('deepseek-v4-pro')
  })

  it('refuses a backup target inside the data root', async () => {
    const workDir = await createTempDir()
    const dataRoot = join(workDir, 'data')
    await seedDataRoot(dataRoot)
    const nested = join(dataRoot, 'backups')
    await mkdir(nested, { recursive: true })

    await expect(exportDataArchive(dataRoot, nested)).rejects.toThrow(
      'outside the data directory'
    )
  })

  it('requires the target parent to exist and be a directory', async () => {
    const workDir = await createTempDir()
    const dataRoot = join(workDir, 'data')
    await seedDataRoot(dataRoot)

    await expect(
      exportDataArchive(dataRoot, join(workDir, 'missing'))
    ).rejects.toThrow()
  })
})

describe('restoreDataArchive', () => {
  it('restores files from a backup over the data root', async () => {
    const workDir = await createTempDir()
    const dataRoot = join(workDir, 'data')
    const backup = join(workDir, 'backup')
    await seedDataRoot(dataRoot)
    await seedDataRoot(backup)

    // The backup contains an older lesson; the live data was changed.
    await writeFile(join(backup, 'config', 'preferences.json'), '{"model":"restored"}', 'utf-8')
    await writeFile(join(dataRoot, 'config', 'preferences.json'), '{"model":"live"}', 'utf-8')

    await restoreDataArchive(backup, dataRoot)

    expect(
      await readFile(join(dataRoot, 'config', 'preferences.json'), 'utf-8')
    ).toContain('restored')
  })

  it('rejects a directory that does not look like a backup', async () => {
    const workDir = await createTempDir()
    const dataRoot = join(workDir, 'data')
    const notABackup = join(workDir, 'random')
    await seedDataRoot(dataRoot)
    await mkdir(notABackup, { recursive: true })
    await writeFile(join(notABackup, 'readme.txt'), 'hello', 'utf-8')

    await expect(restoreDataArchive(notABackup, dataRoot)).rejects.toThrow(
      '有效的 Socratopia-Local 备份'
    )
  })
})
