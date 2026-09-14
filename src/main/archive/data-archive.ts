/**
 * Local data archive & restore (F17).
 *
 * Copies the whole data root to a timestamped sibling folder and can
 * restore from such a backup. No compression and no cloud: a plain
 * directory copy is the most robust thing for a local-first personal
 * tool (it can be browsed, zipped or synced by the user afterwards).
 */

import { cp, readdir, stat } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'

function formatStamp(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join('') + '-' + [pad(date.getHours()), pad(date.getMinutes()), pad(date.getSeconds())].join('')
}

/** True when `child` is inside `parent` (both resolved). */
function isInside(parent: string, child: string): boolean {
  const parentResolved = resolve(parent)
  const childResolved = resolve(child)
  return (
    childResolved === parentResolved ||
    childResolved.startsWith(parentResolved.endsWith(sep) ? parentResolved : parentResolved + sep)
  )
}

/**
 * Copy `dataRoot` into `targetParentDir/Socratopia-Local-backup-YYYYMMDD-HHMMSS`.
 *
 * @returns the created backup directory.
 */
export async function exportDataArchive(
  dataRoot: string,
  targetParentDir: string,
  now: Date = new Date()
): Promise<string> {
  const parentInfo = await stat(targetParentDir)
  if (!parentInfo.isDirectory()) {
    throw new Error('Backup target must be a directory')
  }

  const target = join(targetParentDir, `Socratopia-Local-backup-${formatStamp(now)}`)
  if (isInside(dataRoot, target) || isInside(target, dataRoot)) {
    throw new Error('Backup target must be outside the data directory')
  }

  await cp(dataRoot, target, { recursive: true, force: true })
  return target
}

/**
 * Restore a backup directory over the current data root.
 *
 * The backup must look like a Socratopia-Local data directory, and the
 * caller is responsible for warning the user that current files are
 * overwritten (the UI confirms before calling this).
 */
export async function restoreDataArchive(
  backupDir: string,
  dataRoot: string
): Promise<void> {
  const info = await stat(backupDir)
  if (!info.isDirectory()) {
    throw new Error('Backup path must be a directory')
  }

  const entries = await readdir(backupDir)
  const looksValid = entries.includes('config') || entries.includes('profiles')
  if (!looksValid) {
    throw new Error('所选目录不是有效的 Socratopia-Local 备份')
  }

  if (isInside(backupDir, dataRoot) || isInside(dataRoot, backupDir)) {
    throw new Error('Backup path must be outside the data directory')
  }

  await cp(backupDir, dataRoot, { recursive: true, force: true })
}
