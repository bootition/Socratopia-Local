import { readFile } from 'node:fs/promises'
import { join, basename } from 'node:path'
import { ipcMain } from 'electron'
import type { Companion } from '../../shared/schemas/companion'
import { CompanionSchema } from '../../shared/schemas/companion'
import { IpcGetCompanionInputSchema } from '../../shared/schemas/ipc'
import { COMPANIONS_LIST, COMPANIONS_GET } from '../../shared/channel-names'

// ---------------------------------------------------------------
// Path traversal guard
// ---------------------------------------------------------------

const INVALID_ID_PATTERN = /[\\/.]/

/**
 * Reject companion IDs that contain path separators or dots,
 * preventing directory traversal attacks.
 */
function assertSafeId(companionId: string): void {
  if (INVALID_ID_PATTERN.test(companionId)) {
    throw new Error('Invalid companion id')
  }
}

/**
 * Validate that a filename is safe for use in path construction.
 *
 * Rejects:
 * - Empty strings
 * - Null bytes
 * - Colons (e.g. Windows drive-letter names)
 * - Any path component beyond a single basename
 * - `.` and `..`
 *
 * Accepts valid filenames like `alice.md` and `holmes.md`.
 */
function assertSafeFilename(filename: string): void {
  if (!filename || filename.length === 0) {
    throw new Error('Invalid companion id')
  }
  if (filename.includes('\x00')) {
    throw new Error('Invalid companion id')
  }
  if (filename.includes(':')) {
    throw new Error('Invalid companion id')
  }
  const base = basename(filename)
  if (base !== filename) {
    throw new Error('Invalid companion id')
  }
  if (filename === '.' || filename === '..') {
    throw new Error('Invalid companion id')
  }
}

// ---------------------------------------------------------------
// Core helpers
// ---------------------------------------------------------------

/**
 * Read and parse the companion index from a directory.
 *
 * Parses `index.json`, validates every entry against `CompanionSchema`,
 * and returns the typed list.
 */
export async function readCompanionIndex(companionDir: string): Promise<Companion[]> {
  const indexPath = join(companionDir, 'index.json')
  const raw = await readFile(indexPath, 'utf-8')

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('Failed to parse index.json')
  }

  if (!Array.isArray(parsed)) {
    throw new Error('index.json must contain an array')
  }

  const companions: Companion[] = []
  for (const item of parsed) {
    const result = CompanionSchema.safeParse(item)
    if (!result.success) {
      throw new Error(
        `Invalid companion entry in index.json: ${JSON.stringify(result.error.issues)}`
      )
    }
    companions.push(result.data as Companion)
  }

  return companions
}

/**
 * Read the full markdown content for a specific companion.
 *
 * Security:
 * - Rejects companion IDs containing `/`, `\\`, or `.` BEFORE any I/O.
 * - Loads the index to find the companion and validate its `originalFile` field.
 * - Reads only from the given `companionDir`.
 */
export async function readCompanionMarkdown(
  companionDir: string,
  companionId: string
): Promise<string> {
  // Step 1: reject path traversal in the ID itself
  assertSafeId(companionId)

  // Step 2: load the index to find the companion record
  const companions = await readCompanionIndex(companionDir)
  const companion = companions.find((c) => c.id === companionId)

  if (!companion) {
    throw new Error('Companion not found')
  }

  // Step 3: validate the originalFile field is a safe filename
  assertSafeFilename(companion.originalFile)

  // Step 4: read the markdown from companionDir
  const mdPath = join(companionDir, companion.originalFile)
  return readFile(mdPath, 'utf-8')
}

// ---------------------------------------------------------------
// IPC registration
// ---------------------------------------------------------------

/**
 * Register IPC handlers for companion read operations.
 *
 * Exposes:
 * - `companions:list`  → Companion[] (metadata only)
 * - `companions:get`   → { companion, markdown } (metadata + text)
 *
 * The renderer never receives filesystem paths beyond the
 * `originalFile` filename and the markdown text content.
 */
export function registerCompanionIpc(options: { companionDir: string }): void {
  const { companionDir } = options

  ipcMain.handle(COMPANIONS_LIST, async () => {
    return readCompanionIndex(companionDir)
  })

  ipcMain.handle(COMPANIONS_GET, async (_event, input: unknown) => {
    const parsed = IpcGetCompanionInputSchema.parse(input)

    // Reject path traversal at the boundary before any I/O
    assertSafeId(parsed.companionId)

    // Load index once to find companion metadata
    const companions = await readCompanionIndex(companionDir)
    const companion = companions.find((c) => c.id === parsed.companionId)

    if (!companion) {
      throw new Error('Companion not found')
    }

    // Reuse readCompanionMarkdown for the validated markdown read path
    const markdown = await readCompanionMarkdown(companionDir, parsed.companionId)

    return { companion, markdown }
  })
}