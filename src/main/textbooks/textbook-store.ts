import { mkdir, writeFile, readFile, readdir, rm, access, copyFile } from 'node:fs/promises'
import { join, extname } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Textbook, TextbookMetadata } from '../../shared/schemas/textbook'
import { TextbookMetadataSchema } from '../../shared/schemas/textbook'
import type { TextbookFormat } from '../../shared/types/ids'
import { TextbookFormat as Format } from '../../shared/types/ids'

// ---------------------------------------------------------------
// Types
// ---------------------------------------------------------------

export interface CreateTextbookFromTextInput {
  worldId: string
  title: string
  format: 'markdown' | 'text'
  content: string
}

// ---------------------------------------------------------------
// ID safety
// ---------------------------------------------------------------

const PATH_TRAVERSAL_PATTERN = /[\\/:.]/

function assertSafeId(textbookId: string): void {
  if (!textbookId || textbookId.length === 0) {
    throw new Error('Invalid textbook id')
  }
  if (textbookId.includes('\x00')) {
    throw new Error('Invalid textbook id')
  }
  if (PATH_TRAVERSAL_PATTERN.test(textbookId)) {
    throw new Error('Invalid textbook id')
  }
}

// ---------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------

function generateTextbookId(): string {
  const timestamp = Date.now()
  const random = randomUUID().replace(/-/g, '').slice(0, 12)
  return `tb_${timestamp}_${random}`
}

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

function normalizeTitle(title: string): string {
  return title.trim()
}

function isValidNonEmpty(value: string): boolean {
  return value.trim().length > 0
}

/**
 * Read the textbook body from `source.md`, falling back to a legacy
 * `content` field in `textbook.json` for data written before the
 * metadata/content split.
 */
async function readTextbookContent(
  dir: string,
  legacyParsed: unknown
): Promise<string> {
  try {
    return await readFile(join(dir, 'source.md'), 'utf-8')
  } catch {
    const legacy = (legacyParsed as { content?: unknown } | null)?.content
    if (typeof legacy === 'string' && legacy.length > 0) {
      return legacy
    }
    throw new Error('Textbook content not found')
  }
}

// ---------------------------------------------------------------
// Store functions
// ---------------------------------------------------------------

export async function createTextbookFromText(
  rootDir: string,
  input: CreateTextbookFromTextInput
): Promise<Textbook> {
  // Validate title (reject empty/whitespace)
  const title = normalizeTitle(input.title)
  if (!isValidNonEmpty(input.title)) {
    throw new Error('Title must not be empty')
  }

  // Validate content (reject empty/whitespace)
  if (!isValidNonEmpty(input.content)) {
    throw new Error('Content must not be empty')
  }

  // Validate format (reject anything other than markdown/text)
  if (input.format !== 'markdown' && input.format !== 'text') {
    throw new Error('Invalid textbook format')
  }

  const id = generateTextbookId()
  const now = new Date().toISOString()
  const format: TextbookFormat = input.format === 'markdown' ? Format.Markdown : Format.Text

  const textbookData = {
    id,
    worldId: input.worldId,
    title,
    format,
    sourceFile: 'source.md',
    originalFile: null,
    progress: { currentPage: 0, totalPages: null as number | null },
    createdAt: now,
    updatedAt: now
  }

  // Validate metadata before writing (content is not part of it)
  const parsed = TextbookMetadataSchema.safeParse(textbookData)
  if (!parsed.success) {
    throw new Error(
      `Invalid textbook metadata: ${JSON.stringify(parsed.error.issues)}`
    )
  }

  const dir = join(rootDir, id)
  await mkdir(dir, { recursive: true })

  // Write the body to source.md
  await writeFile(join(dir, 'source.md'), input.content, 'utf-8')

  // Write metadata (without the body) to textbook.json
  await writeFile(join(dir, 'textbook.json'), JSON.stringify(parsed.data, null, 2), 'utf-8')

  return { ...(parsed.data as TextbookMetadata), content: input.content }
}

export interface CreateTextbookFromFileInput {
  worldId: string
  title: string
  format: TextbookFormat
  /** Extracted plain text (Markdown-ish). */
  text: string
  /** Per-page text for PDF imports. */
  pages?: string[] | null
  /** Page count when known. */
  totalPages?: number | null
  /** Original file name, used to keep a copy next to source.md. */
  originalFileName?: string | null
  /** Original file bytes (copied into the textbook directory). */
  originalData?: Buffer | null
}

/**
 * Create a textbook from an imported file (F28/F29).
 *
 * Keeps the extracted text as `source.md`, the original file as
 * `original.<ext>` (so the learner can re-open or re-import it), and a
 * `pages.json` for paged formats such as PDF.
 */
export async function createTextbookFromFile(
  rootDir: string,
  input: CreateTextbookFromFileInput
): Promise<Textbook> {
  const title = normalizeTitle(input.title)
  if (!isValidNonEmpty(input.title)) throw new Error('Title must not be empty')
  if (!isValidNonEmpty(input.text)) throw new Error('Content must not be empty')

  const id = generateTextbookId()
  const now = new Date().toISOString()
  const extension =
    input.originalFileName !== null && input.originalFileName !== undefined
      ? extname(input.originalFileName).toLowerCase()
      : ''

  const textbookData = {
    id,
    worldId: input.worldId,
    title,
    format: input.format,
    sourceFile: 'source.md',
    originalFile: extension.length > 0 ? `original${extension}` : null,
    progress: {
      currentPage: 0,
      totalPages: input.totalPages ?? null
    },
    createdAt: now,
    updatedAt: now
  }

  const parsed = TextbookMetadataSchema.safeParse(textbookData)
  if (!parsed.success) {
    throw new Error(
      `Invalid textbook metadata: ${JSON.stringify(parsed.error.issues)}`
    )
  }

  const dir = join(rootDir, id)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'source.md'), input.text, 'utf-8')

  if (input.pages !== null && input.pages !== undefined && input.pages.length > 0) {
    await writeFile(join(dir, 'pages.json'), JSON.stringify(input.pages, null, 2), 'utf-8')
  }

  if (
    parsed.data.originalFile !== null &&
    input.originalData !== null &&
    input.originalData !== undefined
  ) {
    await writeFile(join(dir, parsed.data.originalFile), input.originalData)
  }

  await writeFile(
    join(dir, 'textbook.json'),
    JSON.stringify(parsed.data, null, 2),
    'utf-8'
  )

  return { ...(parsed.data as TextbookMetadata), content: input.text }
}

/**
 * List textbook metadata, newest first.
 *
 * Never loads `source.md`: listing a large library stays cheap and the
 * renderer only receives titles/progress, not book bodies.
 */
export async function listTextbooks(rootDir: string): Promise<TextbookMetadata[]> {
  let entries: import('node:fs').Dirent[]
  try {
    entries = await readdir(rootDir, { withFileTypes: true })
  } catch {
    return []
  }

  const textbooks: TextbookMetadata[] = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (!entry.name.startsWith('tb_')) continue

    try {
      // Security: validate entry name before constructing path
      assertSafeId(entry.name)

      const metadataPath = join(rootDir, entry.name, 'textbook.json')
      const raw = await readFile(metadataPath, 'utf-8')
      const parsed = JSON.parse(raw)
      const validated = TextbookMetadataSchema.parse(parsed)
      textbooks.push(validated as TextbookMetadata)
    } catch {
      // Skip invalid entries silently
    }
  }

  // Sort by updatedAt descending (newest first)
  textbooks.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  )

  return textbooks
}

/**
 * Get one textbook with its body content loaded from `source.md`.
 */
export async function getTextbook(
  rootDir: string,
  textbookId: string
): Promise<Textbook> {
  // Reject path traversal and null bytes before any I/O
  assertSafeId(textbookId)

  const dir = join(rootDir, textbookId)
  const metadataPath = join(dir, 'textbook.json')

  let raw: string
  try {
    raw = await readFile(metadataPath, 'utf-8')
  } catch {
    throw new Error('Textbook not found')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('Invalid textbook metadata')
  }

  const validated = TextbookMetadataSchema.safeParse(parsed)
  if (!validated.success) {
    throw new Error(
      `Invalid textbook metadata: ${JSON.stringify(validated.error.issues)}`
    )
  }

  const content = await readTextbookContent(dir, parsed)
  return { ...(validated.data as TextbookMetadata), content }
}

/**
 * Delete a textbook directory (F21).
 *
 * The caller warns the user first; conversations that referenced this
 * textbook simply lose their grounding (the prompt falls back to no
 * textbook), so this never deletes lesson history.
 */
export async function deleteTextbook(
  rootDir: string,
  textbookId: string
): Promise<void> {
  assertSafeId(textbookId)
  const dir = join(rootDir, textbookId)
  try {
    await access(dir)
  } catch {
    throw new Error('Textbook not found')
  }
  await rm(dir, { recursive: true, force: true })
}

// ---------------------------------------------------------------
// Progress write-back (F03)
// ---------------------------------------------------------------

export interface TextbookProgressUpdate {
  /** Logical page the learner reached. */
  currentPage?: number
  totalPages?: number | null
  /**
   * Human-readable progress text (as produced by the end-class
   * artifact) written to `progress.md` inside the textbook directory.
   */
  progressMarkdown?: string | null
}

/** Extract the logical page number from an end-class progress block. */
export function parseCurrentPage(progressMarkdown: string): number | null {
  const match = progressMarkdown.match(/当前页码\s*[：:]\s*(\d+)/)
  if (match === null) return null
  const page = Number.parseInt(match[1], 10)
  return Number.isFinite(page) && page >= 0 ? page : null
}

/**
 * Commit a lesson's progress to the textbook metadata and, when given,
 * to the human-readable `progress.md` file.
 *
 * Called only from the end-class flow, so casual page flips during a
 * lesson never become the starting point of the next lesson.
 */
export async function updateTextbookProgress(
  rootDir: string,
  textbookId: string,
  update: TextbookProgressUpdate,
  updatedAt: string = new Date().toISOString()
): Promise<TextbookMetadata> {
  assertSafeId(textbookId)

  const dir = join(rootDir, textbookId)
  const metadataPath = join(dir, 'textbook.json')

  let raw: string
  try {
    raw = await readFile(metadataPath, 'utf-8')
  } catch {
    throw new Error('Textbook not found')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('Invalid textbook metadata')
  }

  const validated = TextbookMetadataSchema.safeParse(parsed)
  if (!validated.success) {
    throw new Error(
      `Invalid textbook metadata: ${JSON.stringify(validated.error.issues)}`
    )
  }

  const current = validated.data as TextbookMetadata
  const next = TextbookMetadataSchema.parse({
    ...current,
    progress: {
      currentPage: update.currentPage ?? current.progress.currentPage,
      totalPages:
        update.totalPages !== undefined
          ? update.totalPages
          : current.progress.totalPages
    },
    updatedAt
  }) as TextbookMetadata

  await writeFile(metadataPath, JSON.stringify(next, null, 2), 'utf-8')

  if (update.progressMarkdown !== undefined) {
    const progressPath = join(dir, 'progress.md')
    if (update.progressMarkdown === null || update.progressMarkdown.trim().length === 0) {
      await rm(progressPath, { force: true })
    } else {
      await writeFile(progressPath, update.progressMarkdown, 'utf-8')
    }
  }

  return next
}

// ---------------------------------------------------------------
// Paged reading (pages.json) and orphan cleanup
// ---------------------------------------------------------------

export interface TextbookPage {
  page: number
  totalPages: number
  text: string
}

/**
 * Read one page of a paged textbook (PDF imports write `pages.json`).
 *
 * Returns null when the textbook has no page data (Markdown/text/EPUB),
 * so the caller can simply hide the reading window.
 */
export async function getTextbookPage(
  rootDir: string,
  textbookId: string,
  page: number
): Promise<TextbookPage | null> {
  assertSafeId(textbookId)

  let raw: string
  try {
    raw = await readFile(join(rootDir, textbookId, 'pages.json'), 'utf-8')
  } catch {
    return null
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!Array.isArray(parsed) || parsed.length === 0) return null

  const pages = parsed.map((entry) => (typeof entry === 'string' ? entry : ''))
  const totalPages = pages.length
  const requested = Number.isInteger(page) && page >= 1 ? page : 1
  const clamped = Math.min(Math.max(requested, 1), totalPages)

  return { page: clamped, totalPages, text: pages[clamped - 1] }
}

/**
 * Directories under the textbook root that start with `tb_` but have no
 * readable metadata (interrupted import, disk full, corrupt JSON).
 * They are invisible in the library yet occupy disk space.
 */
export async function listOrphanTextbookDirs(rootDir: string): Promise<string[]> {
  let entries: import('node:fs').Dirent[]
  try {
    entries = await readdir(rootDir, { withFileTypes: true })
  } catch {
    return []
  }

  const orphans: string[] = []
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith('tb_')) continue
    try {
      const raw = await readFile(join(rootDir, entry.name, 'textbook.json'), 'utf-8')
      const parsed = TextbookMetadataSchema.safeParse(JSON.parse(raw))
      if (!parsed.success) orphans.push(entry.name)
    } catch {
      orphans.push(entry.name)
    }
  }
  return orphans
}

/** Remove every orphan textbook directory; returns how many were removed. */
export async function deleteOrphanTextbookDirs(rootDir: string): Promise<number> {
  const orphans = await listOrphanTextbookDirs(rootDir)
  let removed = 0
  for (const name of orphans) {
    try {
      assertSafeId(name)
      await rm(join(rootDir, name), { recursive: true, force: true })
      removed += 1
    } catch {
      // Skip anything that cannot be removed.
    }
  }
  return removed
}
