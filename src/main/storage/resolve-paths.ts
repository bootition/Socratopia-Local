import { join } from 'node:path'

export interface ReferencePaths {
  /** Directory containing candidate character .md files */
  candidatesDir: string
  /** Path to the world_preset.md file */
  worldPresetPath: string
}

/**
 * Resolve reference asset paths relative to the application root directory.
 *
 * In dev mode, `app.getAppPath()` returns the project root (where package.json lives).
 * In production, reference assets are expected to be bundled alongside the application
 * (via extraResources or build-time copying).
 *
 * This function is pure and testable without Electron runtime.
 */
export function resolveReferencePaths(appPath: string): ReferencePaths {
  return {
    candidatesDir: join(appPath, 'reference', '角色设定', 'candidates'),
    worldPresetPath: join(appPath, 'reference', 'world_preset.md')
  }
}
