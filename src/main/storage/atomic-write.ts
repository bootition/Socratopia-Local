/**
 * Atomic file writes (temp file + same-directory rename).
 *
 * Local-first data files are rewritten in place (messages, notes,
 * preferences, companion index). A crash or full disk in the middle of
 * `writeFile` truncates the file and loses the whole history, so every
 * full-file rewrite goes through this helper instead.
 */

import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export async function writeFileAtomic(
  filePath: string,
  data: string
): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
  const temp = `${filePath}.tmp-${process.pid}-${Date.now()}`
  try {
    await writeFile(temp, data, 'utf-8')
    await rename(temp, filePath)
  } catch (err: unknown) {
    // Never leave temp files behind on failure.
    try {
      await rm(temp, { force: true })
    } catch {
      // Best effort.
    }
    throw err
  }
}
