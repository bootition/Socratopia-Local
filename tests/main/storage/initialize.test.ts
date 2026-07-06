import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFile, access, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { ProfileSchema } from '../../../src/shared/schemas/profile'
import { WorldSchema } from '../../../src/shared/schemas/world'
import { CompanionSchema } from '../../../src/shared/schemas/companion'

import { initDataDir, type InitOptions } from '../../../src/main/storage/initialize'
import {
  DEFAULT_PROFILE_ID,
  DEFAULT_WORLD_ID
} from '../../../src/main/storage/app-data'

const TEST_ID = `socratopia-init-${randomUUID()}`
const tempDir = join(tmpdir(), TEST_ID)
const projectsRoot = join('D:', 'Socratopia-Local')
const referenceDir = join(projectsRoot, 'reference', '角色设定', 'candidates')
const worldPresetPath = join(projectsRoot, 'reference', 'world_preset.md')

// Deterministic clock for tests
const FIXED_TIME = '2026-07-06T12:00:00.000Z'
const fixedClock = (): string => FIXED_TIME

// Path helpers matching the app-data layout
const profileRel = join('profiles', DEFAULT_PROFILE_ID)
const worldRel = join(profileRel, 'worlds', DEFAULT_WORLD_ID)
const companionsRel = join(worldRel, 'companions')

function buildOptions(overrides?: Partial<InitOptions>): InitOptions {
  return {
    dataRoot: join(tempDir, 'data'),
    referenceDir,
    worldPresetPath,
    clock: fixedClock,
    ...overrides
  }
}

beforeAll(async () => {
  // tempDir is created as needed by initDataDir
})

afterAll(async () => {
  const { rm } = await import('node:fs/promises')
  await rm(tempDir, { recursive: true, force: true })
})

describe('initDataDir', () => {
  it('creates the data root directory', async () => {
    const opts = buildOptions()
    await initDataDir(opts)
    await access(opts.dataRoot)
  })

  it('creates config/ directory', async () => {
    const opts = buildOptions()
    await initDataDir(opts)
    await access(join(opts.dataRoot, 'config'))
  })

  it('creates profile directory structure', async () => {
    const opts = buildOptions()
    await initDataDir(opts)

    await access(join(opts.dataRoot, profileRel))
    await access(join(opts.dataRoot, profileRel, 'profile.json'))
  })

  it('creates world directory structure', async () => {
    const opts = buildOptions()
    await initDataDir(opts)

    await access(join(opts.dataRoot, worldRel))
    await access(join(opts.dataRoot, worldRel, 'world.json'))
  })

  it('profile.json validates against ProfileSchema', async () => {
    const opts = buildOptions()
    await initDataDir(opts)

    const raw = await readFile(
      join(opts.dataRoot, profileRel, 'profile.json'),
      'utf-8'
    )
    const parsed = JSON.parse(raw)
    const result = ProfileSchema.safeParse(parsed)

    expect(result.success).toBe(true)
  })

  it('profile.json has deterministic content with fixed clock', async () => {
    const opts = buildOptions()
    await initDataDir(opts)

    const raw = await readFile(
      join(opts.dataRoot, profileRel, 'profile.json'),
      'utf-8'
    )
    const profile = JSON.parse(raw)

    expect(profile.name).toBe('Default')
    expect(profile.createdAt).toBe(FIXED_TIME)
    expect(profile.updatedAt).toBe(FIXED_TIME)
    expect(profile.activeWorldId).toBe(DEFAULT_WORLD_ID)
  })

  it('world.json validates against WorldSchema', async () => {
    const opts = buildOptions()
    await initDataDir(opts)

    const raw = await readFile(
      join(opts.dataRoot, worldRel, 'world.json'),
      'utf-8'
    )
    const parsed = JSON.parse(raw)
    const result = WorldSchema.safeParse(parsed)

    expect(result.success).toBe(true)
  })

  it('world.json has correct metadata', async () => {
    const opts = buildOptions()
    await initDataDir(opts)

    const raw = await readFile(
      join(opts.dataRoot, worldRel, 'world.json'),
      'utf-8'
    )
    const world = JSON.parse(raw)

    expect(world.name).toBe('苏格拉底实验室')
    expect(world.profileId).toBe(DEFAULT_PROFILE_ID)
    expect(world.createdAt).toBe(FIXED_TIME)
    expect(world.companionSlots).toEqual({ a: null, b: null, c: null })
  })

  it('story.md is initialized from world_preset.md', async () => {
    const opts = buildOptions()
    await initDataDir(opts)

    const storyRaw = await readFile(
      join(opts.dataRoot, worldRel, 'story.md'),
      'utf-8'
    )
    const presetRaw = await readFile(worldPresetPath, 'utf-8')

    expect(storyRaw).toBe(presetRaw)
  })

  it('learner.md is created as empty template', async () => {
    const opts = buildOptions()
    await initDataDir(opts)

    const raw = await readFile(
      join(opts.dataRoot, worldRel, 'learner.md'),
      'utf-8'
    )

    expect(raw.length).toBeGreaterThan(0)
    expect(raw).toContain('#')
  })

  it('creates companions/ directory with 9 markdown files', async () => {
    const opts = buildOptions()
    await initDataDir(opts)

    const companionDir = join(opts.dataRoot, companionsRel)
    const entries = await readdir(companionDir)

    const mdFiles = entries.filter(e => e.endsWith('.md'))
    expect(mdFiles).toHaveLength(9)
  })

  it('companions/index.json validates all entries against CompanionSchema', async () => {
    const opts = buildOptions()
    await initDataDir(opts)

    const raw = await readFile(
      join(opts.dataRoot, companionsRel, 'index.json'),
      'utf-8'
    )
    const companions = JSON.parse(raw)

    expect(Array.isArray(companions)).toBe(true)
    expect(companions).toHaveLength(9)

    for (const companion of companions) {
      const result = CompanionSchema.safeParse(companion)
      if (!result.success) {
        console.error(`Schema failure for ${companion.name}:`, result.error.issues)
      }
      expect(result.success).toBe(true)
    }
  })

  it('result.companionCount is 9', async () => {
    const opts = buildOptions()
    const result = await initDataDir(opts)

    expect(result.companionCount).toBe(9)
  })

  it('result includes valid profile and world', async () => {
    const opts = buildOptions()
    const result = await initDataDir(opts)

    expect(ProfileSchema.safeParse(result.profile).success).toBe(true)
    expect(WorldSchema.safeParse(result.world).success).toBe(true)
  })

  it('is idempotent: running twice does not throw and files remain', async () => {
    const opts = buildOptions()
    await initDataDir(opts)
    await initDataDir(opts)

    // All files should still exist
    await access(join(opts.dataRoot, profileRel, 'profile.json'))
    await access(join(opts.dataRoot, worldRel, 'world.json'))
    await access(join(opts.dataRoot, worldRel, 'story.md'))
    await access(join(opts.dataRoot, companionsRel, 'index.json'))
  })
})
