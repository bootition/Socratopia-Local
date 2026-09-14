import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterAll, describe, expect, it } from 'vitest'

import {
  appendMessage,
  listMessages,
  updateMessage
} from '../../../src/main/conversations/message-store'
import { createConversation } from '../../../src/main/conversations/conversation-store'

const cleanupDirs: string[] = []

async function createRoot(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'socratopia-msg-'))
  cleanupDirs.push(dir)
  return dir
}

async function createConversationId(root: string): Promise<string> {
  const conversation = await createConversation(root, {
    worldId: 'world_default',
    companionId: 'comp_alice',
    textbookId: null,
    title: '测试课堂'
  })
  return conversation.id
}

afterAll(async () => {
  await Promise.all(
    cleanupDirs.map((dir) => rm(dir, { recursive: true, force: true }))
  )
})

describe('appendMessage', () => {
  it('persists a message and reads it back', async () => {
    const root = await createRoot()
    const conversationId = await createConversationId(root)

    const appended = await appendMessage(root, conversationId, {
      role: 'user',
      content: '什么是惯性？'
    })

    expect(appended.id).toMatch(/^msg_/)
    expect(appended.content).toBe('什么是惯性？')

    const listed = await listMessages(root, conversationId)
    expect(listed).toHaveLength(1)
    expect(listed[0].id).toBe(appended.id)

    const raw = await readFile(
      join(root, conversationId, 'messages.jsonl'),
      'utf-8'
    )
    expect(raw.trim().split('\n')).toHaveLength(1)
  })

  it('rejects empty content and unsafe conversation ids', async () => {
    const root = await createRoot()
    const conversationId = await createConversationId(root)

    await expect(
      appendMessage(root, conversationId, { role: 'user', content: '   ' })
    ).rejects.toThrow()
    await expect(
      appendMessage(root, '../etc', { role: 'user', content: 'x' })
    ).rejects.toThrow()
  })

  it('skips corrupt JSONL rows instead of failing the whole list', async () => {
    const root = await createRoot()
    const conversationId = await createConversationId(root)

    await appendMessage(root, conversationId, {
      role: 'user',
      content: 'good'
    })
    await writeFile(
      join(root, conversationId, 'messages.jsonl'),
      'not json\n',
      { flag: 'a' }
    )

    const listed = await listMessages(root, conversationId)
    expect(listed.map((m) => m.content)).toEqual(['good'])
  })

  it('returns an empty list for a conversation without messages', async () => {
    const root = await createRoot()
    const conversationId = await createConversationId(root)
    await expect(listMessages(root, conversationId)).resolves.toEqual([])
  })
})

describe('updateMessage', () => {
  it('rewrites only the target message', async () => {
    const root = await createRoot()
    const conversationId = await createConversationId(root)

    const first = await appendMessage(root, conversationId, {
      role: 'user',
      content: '第一条'
    })
    const second = await appendMessage(root, conversationId, {
      role: 'assistant',
      content: '第二条'
    })

    const updated = await updateMessage(
      root,
      conversationId,
      first.id,
      '改过的第一条'
    )
    expect(updated.content).toBe('改过的第一条')

    const listed = await listMessages(root, conversationId)
    expect(listed.map((m) => m.content)).toEqual(['改过的第一条', '第二条'])
    expect(listed[1].id).toBe(second.id)
  })

  it('rejects unknown ids and empty content', async () => {
    const root = await createRoot()
    const conversationId = await createConversationId(root)
    const message = await appendMessage(root, conversationId, {
      role: 'user',
      content: 'x'
    })

    await expect(
      updateMessage(root, conversationId, 'msg_missing', 'y')
    ).rejects.toThrow('Message not found')
    await expect(
      updateMessage(root, conversationId, message.id, '   ')
    ).rejects.toThrow()
  })

  it('serializes concurrent append and update without losing either', async () => {
    const root = await createRoot()
    const conversationId = await createConversationId(root)
    const first = await appendMessage(root, conversationId, {
      role: 'user',
      content: '原来'
    })

    await Promise.all([
      updateMessage(root, conversationId, first.id, '编辑后'),
      appendMessage(root, conversationId, {
        role: 'assistant',
        content: '新回复'
      })
    ])

    const listed = await listMessages(root, conversationId)
    expect(listed.map((m) => m.content).sort()).toEqual(
      ['新回复', '编辑后'].sort()
    )
  })
})
