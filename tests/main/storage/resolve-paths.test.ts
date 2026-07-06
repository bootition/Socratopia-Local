import { describe, it, expect } from 'vitest'
import { join, sep } from 'node:path'
import { resolveReferencePaths } from '../../../src/main/storage/resolve-paths'

describe('resolveReferencePaths', () => {
  const appPathUnix = '/opt/socratopia'
  const appPathWin = 'C:\\Users\\user\\AppData\\Local\\Programs\\socratopia'

  it('resolves candidatesDir from appPath on Unix', () => {
    const result = resolveReferencePaths(appPathUnix)
    expect(result.candidatesDir).toBe(
      join(appPathUnix, 'reference', '角色设定', 'candidates')
    )
  })

  it('resolves candidatesDir from appPath on Windows', () => {
    const result = resolveReferencePaths(appPathWin)
    expect(result.candidatesDir).toBe(
      join(appPathWin, 'reference', '角色设定', 'candidates')
    )
  })

  it('resolves worldPresetPath from appPath', () => {
    const result = resolveReferencePaths(appPathUnix)
    expect(result.worldPresetPath).toBe(
      join(appPathUnix, 'reference', 'world_preset.md')
    )
  })

  it('resolves paths relative to appPath, not cwd', () => {
    const input = process.platform === 'win32' ? 'C:\\my\\app' : '/my/app'
    const prefix = process.platform === 'win32' ? 'C:\\my\\app' : '/my/app'
    const result = resolveReferencePaths(input)
    // Paths should be absolute (start with the appPath)
    expect(result.candidatesDir.startsWith(prefix)).toBe(true)
    expect(result.worldPresetPath.startsWith(prefix)).toBe(true)
  })

  it('preserves correct nesting depth', () => {
    const appPath = process.platform === 'win32' ? 'C:\\root' : '/root'
    const result = resolveReferencePaths(appPath)
    // Should be 3 levels deep from appPath for candidatesDir:
    // appPath/reference/角色设定/candidates
    const relative = result.candidatesDir.slice(appPath.length + 1)
    const parts = relative.split(sep)
    expect(parts).toHaveLength(3)
    expect(parts[0]).toBe('reference')
  })

  it('handles appPath with trailing separator', () => {
    const base = process.platform === 'win32' ? 'C:\\root' : '/root'
    const withTrailing = base + sep
    const result = resolveReferencePaths(withTrailing)
    const noTrailing = resolveReferencePaths(base)
    // join() normalizes trailing slashes, so both should be identical
    expect(result.candidatesDir).toBe(noTrailing.candidatesDir)
  })

  it('uses path.join for OS-safe separators', () => {
    const result = resolveReferencePaths('/root')
    // On Windows, sep is '\\'; on Unix, '/'
    const sepCount = (result.candidatesDir.match(new RegExp(`\\${sep}`, 'g')) ?? []).length
    // root + reference + 角色设定 + candidates = 3 separators
    expect(sepCount).toBeGreaterThanOrEqual(3)
  })
})
