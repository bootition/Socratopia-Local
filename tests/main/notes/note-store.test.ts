/**
 * Tests for NoteStore — classroom notes & highlights (F05).
 */
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'

import { NoteStore } from '../../../src/main/notes/note-store'

const cleanupDirs: string[] = []

async function createStore(): Promise<{ store: NoteStore; root: string }> {
  const root = join(tmpdir(), `socratopia-notes-${randomUUID()}`)
  await rm(root, { recursive: true, force: true })
  cleanupDirs.push(root)
  return { store: new NoteStore(join(root, 'notes.jsonl')), root }
}

afterAll(async () => {
  await Promise.all(cleanupDirs.map((d) => rm(d, { recursive: true, force: true })))
})

describe('NoteStore', () => {
  it('creates a note and lists it by conversation', async () => {
    const { store } = await createStore()

    const note = await store.create({
      conversationId: 'conv_1',
      messageId: 'msg_1',
      text: '这里我没听懂',
      quote: '物体保持静止或匀速直线运动。',
      color: 'green'
    })

    expect(note.id).toMatch(/^note_/)
    expect(note.kind).toBe('note')
    expect(note.color).toBe('green')

    const own = await store.list('conv_1')
    expect(own).toHaveLength(1)
    expect(own[0].text).toBe('这里我没听懂')
    expect(await store.list('conv_other')).toEqual([])
    expect(await store.list()).toHaveLength(1)
  })

  it('updates text and color while keeping the quote', async () => {
    const { store } = await createStore()
    const created = await store.create({
      conversationId: 'conv_1',
      messageId: null,
      text: '旧内容',
      quote: '引用'
    })

    const updated = await store.update(created.id, {
      text: '新内容',
      color: 'pink'
    })

    expect(updated.text).toBe('新内容')
    expect(updated.color).toBe('pink')
    expect(updated.quote).toBe('引用')
    expect(updated.createdAt).toBe(created.createdAt)

    const list = await store.list('conv_1')
    expect(list[0].text).toBe('新内容')
  })

  it('deletes a note and persists the removal', async () => {
    const { store, root } = await createStore()
    const created = await store.create({
      conversationId: 'conv_1',
      text: '待删除'
    })

    await store.delete(created.id)
    expect(await store.list('conv_1')).toEqual([])

    // A fresh store instance reads the same (now empty) file
    const reloaded = new NoteStore(join(root, 'notes.jsonl'))
    expect(await reloaded.list()).toEqual([])
  })

  it('rejects empty text and unknown ids', async () => {
    const { store } = await createStore()
    await expect(
      store.create({ conversationId: 'conv_1', text: '   ' })
    ).rejects.toThrow('Note text must not be empty')
    await expect(store.update('note_missing', { text: 'x' })).rejects.toThrow(
      'Note not found'
    )
    await expect(store.delete('note_missing')).rejects.toThrow('Note not found')
  })

  it('creates lesson-level notes with messageId null', async () => {
    const { store } = await createStore()
    const note = await store.create({
      conversationId: 'conv_1',
      kind: 'highlight',
      text: '整节课的重点',
      color: 'blue'
    })
    expect(note.messageId).toBeNull()
    expect(note.kind).toBe('highlight')
  })
})
