import { mkdir, writeFile, readFile, copyFile } from 'node:fs/promises'
import type { Profile } from '../../shared/schemas/profile'
import type { World } from '../../shared/schemas/world'
import type { ProfileId, WorldId } from '../../shared/types/ids'
import {
  DEFAULT_PROFILE_ID,
  DEFAULT_PROFILE_NAME,
  DEFAULT_WORLD_ID,
  DEFAULT_WORLD_NAME,
  profileDir,
  profilePath,
  worldDir,
  worldPath,
  storyPath,
  learnerPath,
  companionDir,
  configDir
} from './app-data'
import { loadReferenceCompanions } from '../companions/reference-loader'

export interface InitOptions {
  /** Root directory for all local app data */
  dataRoot: string
  /** Directory containing reference candidate character .md files */
  referenceDir: string
  /** Path to the world_preset.md file */
  worldPresetPath: string
  /** Optional clock override for deterministic timestamps (injection for tests) */
  clock?: () => string
}

export interface InitResult {
  profile: Profile
  world: World
  companionCount: number
}

const LEARNER_TEMPLATE = `# 学习者档案

## 基本信息

- **称呼**：（你希望角色怎么叫你？）
- **年级/身份**：
- **当前学习阶段**：

## 学习偏好

- **擅长科目**：
- **困难科目**：
- **学习风格**：（阅读、对话、做题、实验……？）
- **喜欢的教学节奏**：（慢而深 / 快而广 / 跟教材走……）

## 当前目标

（写下来，告诉你的苏格拉底伙伴你想达成什么学习目标。）
`

/**
 * Initialize the local app data directory structure.
 *
 * Creates the full default profile, world, story, learner template,
 * and loads/copies all 9 reference companions into the companion pool.
 *
 * Idempotent: if the data root already exists, this is a no-op
 * (does not overwrite existing files).
 */
export async function initDataDir(options: InitOptions): Promise<InitResult> {
  const { dataRoot, referenceDir, worldPresetPath, clock } = options
  const now = clock ? clock() : new Date().toISOString()

  // --- Create directory structure ---
  await mkdir(configDir(dataRoot), { recursive: true })
  await mkdir(profileDir(dataRoot), { recursive: true })
  await mkdir(worldDir(dataRoot), { recursive: true })
  await mkdir(companionDir(dataRoot), { recursive: true })

  // --- Write profile.json (only if not exists) ---
  const profile: Profile = {
    id: DEFAULT_PROFILE_ID as ProfileId,
    name: DEFAULT_PROFILE_NAME,
    createdAt: now,
    updatedAt: now,
    activeWorldId: DEFAULT_WORLD_ID as WorldId
  }

  const pfPath = profilePath(dataRoot)
  try {
    await writeFile(pfPath, JSON.stringify(profile, null, 2), { flag: 'wx' })
  } catch {
    // File exists — skip, preserve existing
  }

  // --- Write world.json (only if not exists) ---
  const world: World = {
    id: DEFAULT_WORLD_ID as WorldId,
    profileId: DEFAULT_PROFILE_ID as ProfileId,
    name: DEFAULT_WORLD_NAME,
    story: '',
    learnerProfile: '',
    companionSlots: { a: null, b: null, c: null },
    createdAt: now,
    updatedAt: now
  }

  const wrldPath = worldPath(dataRoot)
  try {
    await writeFile(wrldPath, JSON.stringify(world, null, 2), { flag: 'wx' })
  } catch {
    // File exists — skip
  }

  // --- Copy world_preset.md as story.md (only if not exists) ---
  const stPath = storyPath(dataRoot)
  try {
    const presetContent = await readFile(worldPresetPath, 'utf-8')
    await writeFile(stPath, presetContent, { flag: 'wx' })
  } catch {
    // File exists — skip
  }

  // --- Write learner.md template (only if not exists) ---
  const lnPath = learnerPath(dataRoot)
  try {
    await writeFile(lnPath, LEARNER_TEMPLATE, { flag: 'wx' })
  } catch {
    // File exists — skip
  }

  // --- Load reference companions ---
  const result = await loadReferenceCompanions({
    candidatesDir: referenceDir,
    companionDir: companionDir(dataRoot)
  })

  return {
    profile,
    world,
    companionCount: result.count
  }
}
