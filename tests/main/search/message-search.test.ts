/**
 * Tests for searchMessages — local cross-conversation keyword search.
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'

import { searchMessages } from '../../../src/main/search/message-search'
import { createConversation } from '../../../src/main/conversations/conversation-store'
import { appendMessage } from '../../../src/main/conversations/message-store'

const cleanupDirs: string[] = []

async function createTempDir(): Promise<string> {
  const dir = join(tmpdir(), `socratopia-search-${randomUUID()}`)
  await rm(dir, { recursive: true, force: true })
  cleanupDirs.push(dir)
  return dir
}

afterAll(async () => {
  await Promise.all(cleanupDirs.map((d) => rm(d, { recursive: true, force: true })))
})

async function seedConversation(
  root: string,
  title: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<string> {
  const conversation = await createConversation(root, {
    worldId: 'world_default',
    companionId: 'comp_alice',
    textbookId: null,
    title
  })
  for (const message of messages) {
    await appendMessage(root, conversation.id, message)
  }
  return conversation.id
}

describe('searchMessages', () => {
  it('finds case-insensitive matches with the conversation title', async () => {
    const root = await createTempDir()
    await seedConversation(root, '惯性课', [
      { role: 'user', content: '什么是 Inertia？' },
      { role: 'assistant', content: '想想刹车时人会怎样。' }
    ])
    await seedConversation(root, '浮力课', [
      { role: 'user', content: '阿基米德原理是什么？' }
    ])

    const hits = await searchMessages(root, 'inertia')

    expect(hits).toHaveLength(1)
    expect(hits[0].conversationTitle).toBe('惯性课')
    expect(hits[0].content).toContain('Inertia')
    expect(hits[0].role).toBe('user')
  })

  it('returns hits newest-first and respects the limit', async () => {
    const root = await createTempDir()
    const convId = await seedConversation(root, '机械波', [
      { role: 'user', content: '波的第一条' },
      { role: 'assistant', content: '波的第二条' },
      { role: 'user', content: '波的第三条' }
    ])

    const all = await searchMessages(root, '波')
    expect(all).toHaveLength(3)
    expect(all[0].content).toBe('波的第三条')

    const limited = await searchMessages(root, '波', { limit: 2 })
    expect(limited).toHaveLength(2)
    expect(limited[0].messageId).toBe(all[0].messageId)

    // Every hit points at the same conversation
    expect(new Set(all.map((h) => h.conversationId))).toEqual(new Set([convId]))
  })

  it('skips corrupt JSONL lines instead of failing', async () => {
    const root = await createTempDir()
    const convId = await seedConversation(root, '混合', [
      { role: 'user', content: '正常的一条关于惯性的消息' }
    ])
    const messagesPath = join(root, convId, 'messages.jsonl')
    const { readFile } = await import('node:fs/promises')
    const existing = await readFile(messagesPath, 'utf-8')
    await writeFile(messagesPath, `${existing}{broken json\n`, 'utf-8')

    const hits = await searchMessages(root, '惯性')
    expect(hits).toHaveLength(1)
  })

  it('returns an empty array for a missing root or blank query', async () => {
    const root = await createTempDir()
    expect(await searchMessages(root, 'nothing')).toEqual([])
    expect(await searchMessages(root, '   ')).toEqual([])
    expect(await searchMessages(join(root, 'does-not-exist'), '惯性')).toEqual([])
  })
})
