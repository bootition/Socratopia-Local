import { join } from 'node:path'

/**
 * Path resolution helpers for the local data layout.
 *
 * Layout:
 *   {dataRoot}/
 *     config/
 *     profiles/
 *       {profileId}/
 *         profile.json
 *         worlds/
 *           {worldId}/
 *             world.json
 *             story.md
 *             learner.md
 *             companions/
 *               index.json
 *               *.md
 */

export const DEFAULT_PROFILE_ID = 'prof_default'
export const DEFAULT_PROFILE_NAME = 'Default'
export const DEFAULT_WORLD_ID = 'world_default'
export const DEFAULT_WORLD_NAME = '苏格拉底实验室'

export function profileDir(dataRoot: string, profileId: string = DEFAULT_PROFILE_ID): string {
  return join(dataRoot, 'profiles', profileId)
}

export function profilePath(dataRoot: string, profileId: string = DEFAULT_PROFILE_ID): string {
  return join(profileDir(dataRoot, profileId), 'profile.json')
}

export function worldDir(
  dataRoot: string,
  worldId: string = DEFAULT_WORLD_ID,
  profileId: string = DEFAULT_PROFILE_ID
): string {
  return join(profileDir(dataRoot, profileId), 'worlds', worldId)
}

export function worldPath(
  dataRoot: string,
  worldId: string = DEFAULT_WORLD_ID,
  profileId: string = DEFAULT_PROFILE_ID
): string {
  return join(worldDir(dataRoot, worldId, profileId), 'world.json')
}

export function storyPath(
  dataRoot: string,
  worldId: string = DEFAULT_WORLD_ID,
  profileId: string = DEFAULT_PROFILE_ID
): string {
  return join(worldDir(dataRoot, worldId, profileId), 'story.md')
}

export function learnerPath(
  dataRoot: string,
  worldId: string = DEFAULT_WORLD_ID,
  profileId: string = DEFAULT_PROFILE_ID
): string {
  return join(worldDir(dataRoot, worldId, profileId), 'learner.md')
}

export function companionDir(
  dataRoot: string,
  worldId: string = DEFAULT_WORLD_ID,
  profileId: string = DEFAULT_PROFILE_ID
): string {
  return join(worldDir(dataRoot, worldId, profileId), 'companions')
}

/** Imported textbooks (source.md + metadata + original file). */
export function textbookDir(
  dataRoot: string,
  worldId: string = DEFAULT_WORLD_ID,
  profileId: string = DEFAULT_PROFILE_ID
): string {
  return join(worldDir(dataRoot, worldId, profileId), 'textbooks')
}

/** Classroom conversations (messages.jsonl + artifacts). */
export function conversationDir(
  dataRoot: string,
  worldId: string = DEFAULT_WORLD_ID,
  profileId: string = DEFAULT_PROFILE_ID
): string {
  return join(worldDir(dataRoot, worldId, profileId), 'conversations')
}

/** Notes & highlights JSONL for the default world. */
export function notesPath(
  dataRoot: string,
  worldId: string = DEFAULT_WORLD_ID,
  profileId: string = DEFAULT_PROFILE_ID
): string {
  return join(worldDir(dataRoot, worldId, profileId), 'notes.jsonl')
}

export function configDir(dataRoot: string): string {
  return join(dataRoot, 'config')
}
