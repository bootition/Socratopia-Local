/**
 * Tests for ArtifactStore — end-class artifact persistence.
 */
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'

import { ArtifactStore } from '../../../src/main/artifacts/artifact-store'
import {
  ArtifactStatus,
  type EndClassRecord
} from '../../../src/shared/schemas/artifact'
import { ArtifactType } from '../../../src/shared/types/ids'

const cleanupDirs: string[] = []

async function createTempDir(): Promise<string> {
  const dir = join(tmpdir(), `socratopia-artifacts-${randomUUID()}`)
  await rm(dir, { recursive: true, force: true })
  cleanupDirs.push(dir)
  return dir
}

afterAll(async () => {
  await Promise.all(cleanupDirs.map((d) => rm(d, { recursive: true, force: true })))
})

function makeRecord(overrides: Partial<EndClassRecord> = {}): EndClassRecord {
  return {
    conversationId: 'conv_1',
    generatedAt: '2026-09-14T10:00:00.000Z',
    model: 'deepseek-v4-pro',
    farewell: '下次见。',
    status: {
      lesson_summary: ArtifactStatus.Complete,
      flashcards: ArtifactStatus.Complete,
      diary: ArtifactStatus.Complete,
      progress: ArtifactStatus.Complete,
      handoff_tail: ArtifactStatus.Complete
    },
    summary: '本节讲了惯性。',
    flashcards: [{ question: '什么是惯性？', answer: '……', explanation: '' }],
    diary: '## 2026-09-14\n今天学了惯性。',
    progress: '当前页码：2',
    handoffTail: [{ role: 'user', content: '什么是惯性？' }],
    rawOutputFile: null,
    ...overrides
  }
}

describe('ArtifactStore', () => {
  it('returns null when no artifact record exists', async () => {
    const store = new ArtifactStore(await createTempDir())
    expect(await store.read('conv_missing')).toBeNull()
  })

  it('round-trips a record through human-readable files', async () => {
    const root = await createTempDir()
    const store = new ArtifactStore(root)
    await store.save('conv_1', makeRecord())

    const loaded = await store.read('conv_1')
    expect(loaded).toEqual(makeRecord())

    // Files are plain and readable without the app
    const summary = await readFile(
      join(root, 'conv_1', 'artifacts', 'summary.md'),
      'utf-8'
    )
    expect(summary).toBe('本节讲了惯性。')
    const flashcards = JSON.parse(
      await readFile(join(root, 'conv_1', 'artifacts', 'flashcards.json'), 'utf-8')
    )
    expect(flashcards[0].question).toBe('什么是惯性？')
  })

  it('saves the raw model output when generation fails', async () => {
    const root = await createTempDir()
    const store = new ArtifactStore(root)
    const record = makeRecord({
      summary: null,
      status: {
        ...makeRecord().status,
        lesson_summary: ArtifactStatus.Failed
      }
    })

    await store.save('conv_1', record, 'broken model output')
    expect(await store.readRaw('conv_1')).toBe('broken model output')

    const loaded = await store.read('conv_1')
    expect(loaded!.rawOutputFile).toBe('raw-end-class.txt')
  })

  it('removes artifact files for null sections', async () => {
    const root = await createTempDir()
    const store = new ArtifactStore(root)
    await store.save('conv_1', makeRecord())
    await store.save('conv_1', makeRecord({ summary: null, flashcards: null }))

    const loaded = await store.read('conv_1')
    expect(loaded!.summary).toBeNull()
    expect(loaded!.flashcards).toBeNull()

    await expect(
      readFile(join(root, 'conv_1', 'artifacts', 'summary.md'), 'utf-8')
    ).rejects.toThrow()
  })

  it('rejects unsafe conversation ids', async () => {
    const store = new ArtifactStore(await createTempDir())
    await expect(store.read('../escape')).rejects.toThrow('Invalid conversation id')
    await expect(store.save('a/b', makeRecord())).rejects.toThrow(
      'Invalid conversation id'
    )
  })

  it('keeps the artifact type enum aligned with the status keys', () => {
    // Guards against adding a type without a status field.
    const record = makeRecord()
    const keys = Object.keys(record.status)
    expect(keys.sort()).toEqual(
      [
        ArtifactType.LessonSummary,
        ArtifactType.Flashcards,
        ArtifactType.Diary,
        ArtifactType.Progress,
        ArtifactType.HandoffTail
      ].sort()
    )
  })

  it('updates flashcards and marks the artifact complete', async () => {
    const root = await createTempDir()
    const store = new ArtifactStore(root)
    await store.save('conv_1', makeRecord({ flashcards: null, status: { ...makeRecord().status, flashcards: ArtifactStatus.Failed } }))

    const updated = await store.updateFlashcards('conv_1', [
      { question: '手写的问题', answer: '手写的答案', explanation: '' }
    ])

    expect(updated.flashcards).toHaveLength(1)
    expect(updated.status.flashcards).toBe(ArtifactStatus.Complete)
    expect((await store.read('conv_1'))!.flashcards![0].question).toBe('手写的问题')
  })

  it('marks flashcards failed when the edited list is empty', async () => {
    const root = await createTempDir()
    const store = new ArtifactStore(root)
    await store.save('conv_1', makeRecord())

    const updated = await store.updateFlashcards('conv_1', [])
    expect(updated.flashcards).toEqual([])
    expect(updated.status.flashcards).toBe(ArtifactStatus.Failed)
  })

  it('rejects updating flashcards when no record exists', async () => {
    const store = new ArtifactStore(await createTempDir())
    await expect(store.updateFlashcards('conv_missing', [])).rejects.toThrow(
      'No end-class artifacts to update'
    )
  })
})
