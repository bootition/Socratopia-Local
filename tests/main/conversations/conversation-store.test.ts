import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterAll, describe, expect, it } from 'vitest'

import {
  createConversation,
  endConversation,
  getConversation,
  listConversations
} from '../../../src/main/conversations/conversation-store'

const cleanupDirs: string[] = []

async function createRoot(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'socratopia-conv-'))
  cleanupDirs.push(dir)
  return dir
}

afterAll(async () => {
  await Promise.all(
    cleanupDirs.map((dir) => rm(dir, { recursive: true, force: true }))
  )
})

describe('createConversation', () => {
  it('writes conversation.json and returns an open lesson', async () => {
    const root = await createRoot()
    const conversation = await createConversation(root, {
      worldId: 'world_default',
      companionId: 'comp_alice',
      textbookId: 'tb_1',
      title: '惯性'
    })

    expect(conversation.id).toMatch(/^conv_/)
    expect(conversation.endedAt).toBeNull()
    expect(conversation.textbookId).toBe('tb_1')

    const raw = JSON.parse(
      await readFile(join(root, conversation.id, 'conversation.json'), 'utf-8')
    ) as Record<string, unknown>
    expect(raw['title']).toBe('惯性')
    expect(raw['endedAt']).toBeNull()
  })

  it('rejects an empty title', async () => {
    const root = await createRoot()
    await expect(
      createConversation(root, {
        worldId: 'world_default',
        companionId: 'comp_alice',
        textbookId: null,
        title: '   '
      })
    ).rejects.toThrow()
  })
})

describe('list / get', () => {
  it('lists readable conversations and skips corrupt ones', async () => {
    const root = await createRoot()
    const first = await createConversation(root, {
      worldId: 'world_default',
      companionId: 'comp_alice',
      textbookId: null,
      title: 'A'
    })
    const second = await createConversation(root, {
      worldId: 'world_default',
      companionId: 'comp_alice',
      textbookId: null,
      title: 'B'
    })

    const listed = await listConversations(root)
    expect(listed.map((c) => c.id).sort()).toEqual([first.id, second.id].sort())

    await expect(getConversation(root, first.id)).resolves.toMatchObject({
      title: 'A'
    })
    await expect(getConversation(root, 'conv_missing')).rejects.toThrow()
    await expect(getConversation(root, '../etc')).rejects.toThrow()
  })
})

describe('endConversation', () => {
  it('marks the lesson ended without losing its metadata', async () => {
    const root = await createRoot()
    const conversation = await createConversation(root, {
      worldId: 'world_default',
      companionId: 'comp_alice',
      textbookId: null,
      title: '结束'
    })

    const endedAt = '2026-09-14T10:00:00.000Z'
    const ended = await endConversation(root, conversation.id, endedAt)

    expect(ended.endedAt).toBe(endedAt)
    expect(ended.updatedAt).toBe(endedAt)
    expect(ended.title).toBe('结束')

    const reopened = await getConversation(root, conversation.id)
    expect(reopened.endedAt).toBe(endedAt)
  })
})
