/**
 * Tests for UsageStore — local token accounting (F15).
 */
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'

import { UsageStore } from '../../../src/main/settings/usage-store'

const cleanupDirs: string[] = []

async function createTempDir(): Promise<string> {
  const dir = join(tmpdir(), `socratopia-usage-${randomUUID()}`)
  await rm(dir, { recursive: true, force: true })
  cleanupDirs.push(dir)
  return dir
}

afterAll(async () => {
  await Promise.all(cleanupDirs.map((d) => rm(d, { recursive: true, force: true })))
})

describe('UsageStore', () => {
  it('returns an empty summary when nothing was recorded', async () => {
    const store = new UsageStore(await createTempDir())
    expect(await store.summary()).toEqual({
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      calls: 0,
      days: [],
      models: []
    })
  })

  it('aggregates totals, days and models', async () => {
    const root = await createTempDir()
    const store = new UsageStore(root)

    await store.record({
      timestamp: '2026-09-14T09:00:00.000Z',
      model: 'deepseek-v4-pro',
      conversationId: 'conv_1',
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150
    })
    await store.record({
      timestamp: '2026-09-14T10:00:00.000Z',
      model: 'deepseek-v4-flash',
      conversationId: null,
      promptTokens: 40,
      completionTokens: 10,
      totalTokens: 50
    })
    await store.record({
      timestamp: '2026-09-13T10:00:00.000Z',
      model: 'deepseek-v4-pro',
      conversationId: 'conv_1',
      promptTokens: 200,
      completionTokens: 100,
      totalTokens: 300
    })

    const summary = await store.summary()

    expect(summary.calls).toBe(3)
    expect(summary.promptTokens).toBe(340)
    expect(summary.completionTokens).toBe(160)
    expect(summary.totalTokens).toBe(500)

    // Days are newest-first
    expect(summary.days.map((d) => d.date)).toEqual(['2026-09-14', '2026-09-13'])
    expect(summary.days[0].totalTokens).toBe(200)
    expect(summary.days[0].calls).toBe(2)

    // Models are sorted by token volume
    expect(summary.models[0].model).toBe('deepseek-v4-pro')
    expect(summary.models[0].totalTokens).toBe(450)
  })

  it('skips corrupt JSONL rows instead of failing', async () => {
    const root = await createTempDir()
    const store = new UsageStore(root)
    await store.record({
      timestamp: '2026-09-14T09:00:00.000Z',
      model: 'deepseek-v4-pro',
      conversationId: null,
      promptTokens: 1,
      completionTokens: 2,
      totalTokens: 3
    })

    await mkdir(join(root, 'config'), { recursive: true })
    await writeFile(
      join(root, 'config', 'usage.jsonl'),
      `${await (await import('node:fs/promises')).readFile(join(root, 'config', 'usage.jsonl'), 'utf-8')}{broken\n`,
      'utf-8'
    )

    const summary = await store.summary()
    expect(summary.calls).toBe(1)
    expect(summary.totalTokens).toBe(3)
  })

  it('rejects malformed records before writing', async () => {
    const store = new UsageStore(await createTempDir())
    await expect(
      store.record({
        timestamp: 'not-a-date',
        model: 'deepseek-v4-pro',
        conversationId: null,
        promptTokens: 1,
        completionTokens: 1,
        totalTokens: 2
      })
    ).rejects.toThrow()
  })
})
