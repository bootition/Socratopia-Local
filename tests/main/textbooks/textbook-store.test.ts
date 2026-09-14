import { mkdtemp, readFile, mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'

import {
  createTextbookFromFile,
  createTextbookFromText,
  deleteOrphanTextbookDirs,
  deleteTextbook,
  getTextbook,
  getTextbookPage,
  listOrphanTextbookDirs,
  listTextbooks,
  parseCurrentPage,
  updateTextbookProgress
} from '../../../src/main/textbooks/textbook-store'
import { TextbookFormat } from '../../../src/shared/types/ids'

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

const cleanupDirs: string[] = []

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(
    join(tmpdir(), `socratopia-tb-${randomUUID().slice(0, 8)}-`)
  )
  cleanupDirs.push(dir)
  return dir
}

afterAll(async () => {
  await Promise.all(
    cleanupDirs.map((dir) => rm(dir, { recursive: true, force: true }))
  )
})

// ---------------------------------------------------------------
// createTextbookFromText
// ---------------------------------------------------------------

describe('createTextbookFromText', () => {
  it('writes source.md and metadata, and returns the textbook', async () => {
    const root = await createTempDir()
    const textbook = await createTextbookFromText(root, {
      worldId: 'world_default',
      title: '  牛顿力学  ',
      format: 'markdown',
      content: '# 第一章\n\n惯性'
    })

    expect(textbook.title).toBe('牛顿力学')
    expect(textbook.format).toBe('markdown')
    expect(textbook.worldId).toBe('world_default')
    expect(textbook.content).toContain('惯性')
    expect(textbook.originalFile).toBeNull()
    expect(textbook.progress).toEqual({ currentPage: 0, totalPages: null })

    const metadata = JSON.parse(
      await readFile(join(root, textbook.id, 'textbook.json'), 'utf-8')
    ) as Record<string, unknown>
    expect(metadata).not.toHaveProperty('content')
    expect(
      await readFile(join(root, textbook.id, 'source.md'), 'utf-8')
    ).toContain('惯性')
  })

  it('generates unique ids for identical titles', async () => {
    const root = await createTempDir()
    const first = await createTextbookFromText(root, {
      worldId: 'world_default',
      title: '同名教材',
      format: 'text',
      content: 'a'
    })
    const second = await createTextbookFromText(root, {
      worldId: 'world_default',
      title: '同名教材',
      format: 'text',
      content: 'b'
    })

    expect(first.id).not.toBe(second.id)
    expect(await listTextbooks(root)).toHaveLength(2)
  })

  it('rejects empty titles and empty content', async () => {
    const root = await createTempDir()
    await expect(
      createTextbookFromText(root, {
        worldId: 'world_default',
        title: '   ',
        format: 'text',
        content: 'x'
      })
    ).rejects.toThrow()

    await expect(
      createTextbookFromText(root, {
        worldId: 'world_default',
        title: 'ok',
        format: 'text',
        content: '   '
      })
    ).rejects.toThrow()
  })
})

// ---------------------------------------------------------------
// list / get / delete
// ---------------------------------------------------------------

describe('listTextbooks / getTextbook / deleteTextbook', () => {
  it('lists metadata for every readable textbook', async () => {
    const root = await createTempDir()
    const a = await createTextbookFromText(root, {
      worldId: 'world_default',
      title: 'A',
      format: 'text',
      content: 'aa'
    })
    const b = await createTextbookFromText(root, {
      worldId: 'world_default',
      title: 'B',
      format: 'markdown',
      content: 'bb'
    })

    const list = await listTextbooks(root)
    expect(list.map((item) => item.id).sort()).toEqual([a.id, b.id].sort())
    expect(list.every((item) => !('content' in item))).toBe(true)
  })

  it('skips directories with corrupt metadata instead of failing', async () => {
    const root = await createTempDir()
    const good = await createTextbookFromText(root, {
      worldId: 'world_default',
      title: 'Good',
      format: 'text',
      content: 'ok'
    })
    await mkdir(join(root, 'tb_corrupt_1'), { recursive: true })
    await writeFile(join(root, 'tb_corrupt_1', 'textbook.json'), '{ nope', 'utf-8')

    const list = await listTextbooks(root)
    expect(list.map((item) => item.id)).toEqual([good.id])
  })

  it('returns the stored body and throws for unknown ids', async () => {
    const root = await createTempDir()
    const created = await createTextbookFromText(root, {
      worldId: 'world_default',
      title: 'Get',
      format: 'text',
      content: 'body text'
    })

    await expect(getTextbook(root, created.id)).resolves.toMatchObject({
      id: created.id,
      content: 'body text'
    })
    await expect(getTextbook(root, 'tb_missing_1')).rejects.toThrow()
  })

  it('deletes the whole directory and rejects path traversal ids', async () => {
    const root = await createTempDir()
    const created = await createTextbookFromText(root, {
      worldId: 'world_default',
      title: 'Delete',
      format: 'text',
      content: 'x'
    })

    await deleteTextbook(root, created.id)
    await expect(listTextbooks(root)).resolves.toHaveLength(0)

    await expect(deleteTextbook(root, '..')).rejects.toThrow()
    await expect(getTextbook(root, '../etc')).rejects.toThrow()
  })
})

// ---------------------------------------------------------------
// progress
// ---------------------------------------------------------------

describe('parseCurrentPage / updateTextbookProgress', () => {
  it('parses the documented progress format only', () => {
    expect(parseCurrentPage('当前页码：12')).toBe(12)
    expect(parseCurrentPage('当前页码: 7\n说明')).toBe(7)
    expect(parseCurrentPage('第 3 页')).toBeNull()
    expect(parseCurrentPage('')).toBeNull()
  })

  it('updates metadata progress and writes progress.md', async () => {
    const root = await createTempDir()
    const created = await createTextbookFromText(root, {
      worldId: 'world_default',
      title: 'Progress',
      format: 'text',
      content: 'x'
    })

    const updated = await updateTextbookProgress(root, created.id, {
      currentPage: 5,
      totalPages: 20,
      progressMarkdown: '当前页码：5'
    })

    expect(updated.progress).toEqual({ currentPage: 5, totalPages: 20 })
    expect(
      await readFile(join(root, created.id, 'progress.md'), 'utf-8')
    ).toContain('当前页码：5')
  })
})

// ---------------------------------------------------------------
// paged reading + orphan cleanup
// ---------------------------------------------------------------

describe('getTextbookPage', () => {
  it('returns a clamped page for paged textbooks', async () => {
    const root = await createTempDir()
    const created = await createTextbookFromFile(root, {
      worldId: 'world_default',
      title: 'PDF',
      format: TextbookFormat.Pdf,
      text: '第 1 页\n\n第 2 页',
      pages: ['one', 'two', 'three'],
      totalPages: 3
    })

    await expect(getTextbookPage(root, created.id, 2)).resolves.toEqual({
      page: 2,
      totalPages: 3,
      text: 'two'
    })
    await expect(getTextbookPage(root, created.id, 99)).resolves.toMatchObject({
      page: 3
    })
    await expect(getTextbookPage(root, created.id, 0)).resolves.toMatchObject({
      page: 1
    })
  })

  it('returns null when the textbook has no page data', async () => {
    const root = await createTempDir()
    const created = await createTextbookFromText(root, {
      worldId: 'world_default',
      title: 'No pages',
      format: 'text',
      content: 'x'
    })
    await expect(getTextbookPage(root, created.id, 1)).resolves.toBeNull()
  })
})

describe('orphan textbook directories', () => {
  it('lists and removes directories without readable metadata', async () => {
    const root = await createTempDir()
    const valid = await createTextbookFromText(root, {
      worldId: 'world_default',
      title: 'Valid',
      format: 'text',
      content: 'ok'
    })

    await mkdir(join(root, 'tb_interrupted_1'), { recursive: true })
    await writeFile(join(root, 'tb_interrupted_1', 'source.md'), 'partial', 'utf-8')
    await mkdir(join(root, 'tb_broken_2'), { recursive: true })
    await writeFile(join(root, 'tb_broken_2', 'textbook.json'), '{ broken', 'utf-8')

    expect((await listOrphanTextbookDirs(root)).sort()).toEqual([
      'tb_broken_2',
      'tb_interrupted_1'
    ])

    expect(await deleteOrphanTextbookDirs(root)).toBe(2)
    expect(await listOrphanTextbookDirs(root)).toEqual([])
    expect((await listTextbooks(root)).map((item) => item.id)).toEqual([valid.id])
  })
})
