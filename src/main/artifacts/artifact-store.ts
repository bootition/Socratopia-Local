/**
 * End-class artifact persistence.
 *
 * Layout (human-readable, per conversation):
 *
 *   conversations/{conversationId}/artifacts/
 *     meta.json          # status + farewell + model + raw output pointer
 *     summary.md
 *     flashcards.json
 *     diary.md
 *     progress.md
 *     handoff.json
 *     raw-end-class.txt  # only when parsing failed
 */

import { mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import {
  ArtifactStatus,
  EndClassStatusSchema,
  FlashcardSchema,
  HandoffMessageSchema,
  type EndClassRecord,
  type Flashcard,
  type HandoffMessage
} from '../../shared/schemas/artifact'

const PATH_TRAVERSAL_PATTERN = /[\\/:.]/

function assertSafeId(id: string): void {
  if (!id || id.length === 0 || id.includes('\x00') || PATH_TRAVERSAL_PATTERN.test(id)) {
    throw new Error('Invalid conversation id')
  }
}

const RawPointerSchema = z.string().min(1).nullable()

const EndClassMetaSchema = z.object({
  conversationId: z.string().min(1),
  generatedAt: z.string().datetime({ offset: true }),
  model: z.string().min(1),
  farewell: z.string().min(1),
  status: EndClassStatusSchema,
  rawOutputFile: RawPointerSchema
})

type EndClassMeta = z.infer<typeof EndClassMetaSchema>

const FILES = {
  summary: 'summary.md',
  flashcards: 'flashcards.json',
  diary: 'diary.md',
  progress: 'progress.md',
  handoff: 'handoff.json'
} as const

const RAW_FILE = 'raw-end-class.txt'

export class ArtifactStore {
  constructor(private readonly conversationRoot: string) {}

  private artifactsDir(conversationId: string): string {
    assertSafeId(conversationId)
    return join(this.conversationRoot, conversationId, 'artifacts')
  }

  /** Read the assembled record, or null when no end-class ran yet. */
  async read(conversationId: string): Promise<EndClassRecord | null> {
    const dir = this.artifactsDir(conversationId)

    let meta: EndClassMeta
    try {
      const raw = await readFile(join(dir, 'meta.json'), 'utf-8')
      meta = EndClassMetaSchema.parse(JSON.parse(raw))
    } catch (err: unknown) {
      if (isNotFound(err)) return null
      throw err
    }

    return {
      conversationId: meta.conversationId,
      generatedAt: meta.generatedAt,
      model: meta.model,
      farewell: meta.farewell,
      status: meta.status,
      summary: await this.readTextFile(dir, FILES.summary),
      flashcards: await this.readJsonFile<Flashcard>(
        dir,
        FILES.flashcards,
        FlashcardSchema
      ),
      diary: await this.readTextFile(dir, FILES.diary),
      progress: await this.readTextFile(dir, FILES.progress),
      handoffTail: await this.readJsonFile<HandoffMessage>(
        dir,
        FILES.handoff,
        HandoffMessageSchema
      ),
      rawOutputFile: meta.rawOutputFile
    }
  }

  /**
   * Persist a full record plus (optionally) the raw model output.
   * Missing artifacts are removed so files and status stay in sync.
   */
  async save(
    conversationId: string,
    record: EndClassRecord,
    rawOutput?: string | null
  ): Promise<void> {
    const dir = this.artifactsDir(conversationId)
    await mkdir(dir, { recursive: true })

    await this.writeOrRemove(dir, FILES.summary, record.summary)
    await this.writeOrRemove(
      dir,
      FILES.flashcards,
      record.flashcards !== null ? JSON.stringify(record.flashcards, null, 2) : null
    )
    await this.writeOrRemove(dir, FILES.diary, record.diary)
    await this.writeOrRemove(dir, FILES.progress, record.progress)
    await this.writeOrRemove(
      dir,
      FILES.handoff,
      record.handoffTail !== null ? JSON.stringify(record.handoffTail, null, 2) : null
    )

    const meta: EndClassMeta = {
      conversationId: record.conversationId,
      generatedAt: record.generatedAt,
      model: record.model,
      farewell: record.farewell,
      status: record.status,
      rawOutputFile: rawOutput !== undefined && rawOutput !== null ? RAW_FILE : null
    }

    if (rawOutput !== undefined && rawOutput !== null) {
      await writeFile(join(dir, RAW_FILE), rawOutput, 'utf-8')
    } else {
      await rm(join(dir, RAW_FILE), { force: true })
    }

    await writeFile(join(dir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf-8')
  }

  /**
   * Replace the flashcards of a stored record (F12: fully editable).
   * An empty list is allowed and marks the artifact as failed, which
   * lets the normal re-run flow regenerate it.
   */
  async updateFlashcards(
    conversationId: string,
    flashcards: Flashcard[]
  ): Promise<EndClassRecord> {
    const record = await this.read(conversationId)
    if (record === null) {
      throw new Error('No end-class artifacts to update')
    }

    const updated: EndClassRecord = {
      ...record,
      generatedAt: new Date().toISOString(),
      flashcards,
      status: {
        ...record.status,
        flashcards:
          flashcards.length > 0 ? ArtifactStatus.Complete : ArtifactStatus.Failed
      }
    }
    await this.save(conversationId, updated)
    return updated
  }

  /** Raw model output for a failed end-class run, if any. */
  async readRaw(conversationId: string): Promise<string | null> {
    return this.readTextFile(this.artifactsDir(conversationId), RAW_FILE)
  }

  // -------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------

  private async writeOrRemove(
    dir: string,
    filename: string,
    content: string | null
  ): Promise<void> {
    if (content === null) {
      await rm(join(dir, filename), { force: true })
      return
    }
    await writeFile(join(dir, filename), content, 'utf-8')
  }

  private async readTextFile(dir: string, filename: string): Promise<string | null> {
    try {
      const text = await readFile(join(dir, filename), 'utf-8')
      return text.length > 0 ? text : null
    } catch (err: unknown) {
      if (isNotFound(err)) return null
      throw err
    }
  }

  private async readJsonFile<T>(
    dir: string,
    filename: string,
    itemSchema: z.ZodType<T>
  ): Promise<T[] | null> {
    const text = await this.readTextFile(dir, filename)
    if (text === null) return null
    const parsed: unknown = JSON.parse(text)
    if (!Array.isArray(parsed)) return null
    return parsed.map((item) => itemSchema.parse(item))
  }
}

function isNotFound(err: unknown): boolean {
  return (
    err instanceof Error &&
    'code' in err &&
    (err as NodeJS.ErrnoException).code === 'ENOENT'
  )
}
