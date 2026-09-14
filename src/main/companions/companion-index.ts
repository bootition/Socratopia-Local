/**
 * Atomic read/write helpers for the companion index.
 *
 * `index.json` is rewritten on every app start (reference candidates)
 * and on every custom-companion mutation, so a crash mid-write must not
 * be able to destroy it: writes go to a temp file that is renamed into
 * place, which is atomic on POSIX and Windows for same-directory renames.
 */

import { mkdir, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Companion } from '../../shared/schemas/companion'

export function companionIndexPath(companionDir: string): string {
  return join(companionDir, 'index.json')
}

export async function writeCompanionIndexAtomically(
  companionDir: string,
  companions: Companion[]
): Promise<void> {
  await mkdir(companionDir, { recursive: true })
  const target = companionIndexPath(companionDir)
  const temp = `${target}.tmp-${process.pid}-${Date.now()}`
  await writeFile(temp, JSON.stringify(companions, null, 2), 'utf-8')
  await rename(temp, target)
}
