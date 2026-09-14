/**
 * Tests for NotesPanel — notes & highlights overview (F05).
 */
import React from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { NotesPanel } from '../../src/renderer/src/notes/NotesPanel'
import type { SocratopiaAPI } from '../../src/preload'
import type { Conversation } from '../../src/shared/schemas/conversation'
import type { Note } from '../../src/shared/schemas/note'
import { DEFAULT_PREFERENCES } from '../../src/shared/schemas/preferences'

afterEach(() => {
  cleanup()
  Reflect.deleteProperty(window, 'socratopia')
})

const conversation: Conversation = {
  id: 'conv_1' as Conversation['id'],
  worldId: 'world_default' as Conversation['worldId'],
  companionId: 'comp_alice' as Conversation['companionId'],
  textbookId: null,
  title: '惯性课',
  createdAt: '2026-09-14T09:00:00.000Z',
  updatedAt: '2026-09-14T10:00:00.000Z',
  endedAt: null
}

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: 'note_1',
    conversationId: 'conv_1',
    messageId: 'msg_1',
    kind: 'note',
    text: '这里我没听懂',
    quote: '物体保持静止或匀速直线运动。',
    color: 'green',
    createdAt: '2026-09-14T09:30:00.000Z',
    updatedAt: '2026-09-14T09:30:00.000Z',
    ...overrides
  }
}

function installBridge(options: {
  notes?: Note[]
  update?: (input: { noteId: string; text?: string }) => Promise<Note>
  onDelete?: (noteId: string) => Promise<void>
} = {}): {
  update: ReturnType<typeof vi.fn>
  remove: ReturnType<typeof vi.fn>
} {
  const update = vi.fn(
    options.update ?? ((input) => Promise.resolve(makeNote({ text: input.text })))
  )
  const remove = vi.fn(options.onDelete ?? (() => Promise.resolve()))

  const api: SocratopiaAPI = {
    getPlatform: () => Promise.resolve('win32'),
    getVersion: () => Promise.resolve('0.1.0'),
    settings: {
      hasDeepSeekKey: () => Promise.resolve(true),
      setDeepSeekKey: () => Promise.resolve(),
      deleteDeepSeekKey: () => Promise.resolve(),
      getPreferences: () => Promise.resolve(DEFAULT_PREFERENCES),
      setPreferences: () => Promise.resolve(DEFAULT_PREFERENCES)
    },
    notes: {
      list: () => Promise.resolve(options.notes ?? [makeNote()]),
      create: () => Promise.reject(new Error('not used')),
      update: update as SocratopiaAPI['notes']['update'],
      delete: remove as SocratopiaAPI['notes']['delete']
    },
    chat: {
      startStream: () => Promise.reject(new Error('not used')),
      cancelStream: () => Promise.resolve(),
      onToken: () => () => undefined,
      onError: () => () => undefined,
      onEnd: () => () => undefined,
      onUsage: () => () => undefined
    },
    companions: {
      list: () => Promise.resolve([]),
      get: () => Promise.reject(new Error('not used'))
    },
    textbooks: {
      createFromText: () => Promise.reject(new Error('not used')),
      list: () => Promise.resolve([]),
      get: () => Promise.reject(new Error('not used'))
    },
    conversations: {
      create: () => Promise.reject(new Error('not used')),
      list: () => Promise.resolve([conversation]),
      get: () => Promise.reject(new Error('not used'))
    },
    messages: {
      append: () => Promise.reject(new Error('not used')),
      list: () => Promise.resolve([]),
      search: () => Promise.resolve([]),
      update: () => Promise.reject(new Error('not used'))
    },
    artifacts: {
      endClass: () => Promise.reject(new Error('not used')),
      get: () => Promise.resolve(null),
      updateFlashcards: () => Promise.reject(new Error('not used'))
    },
    stats: { get: () => Promise.reject(new Error('not used')) },
    archive: {
      exportBackup: () => Promise.resolve(null),
      restoreBackup: () => Promise.resolve(null),
      openDataFolder: () => Promise.resolve()
    }
  }

  window.socratopia = api
  return { update, remove }
}

describe('NotesPanel', () => {
  it('lists notes with their conversation and quote', async () => {
    installBridge()
    render(<NotesPanel />)

    expect(await screen.findByText('这里我没听懂')).toBeInTheDocument()
    expect(screen.getByText('惯性课')).toBeInTheDocument()
    expect(screen.getByText('物体保持静止或匀速直线运动。')).toBeInTheDocument()
  })

  it('edits a note and shows the saved text', async () => {
    const user = userEvent.setup()
    const { update } = installBridge()
    render(<NotesPanel />)

    await user.click(await screen.findByRole('button', { name: '编辑' }))
    const editor = screen.getByLabelText('笔记内容')
    await user.clear(editor)
    await user.type(editor, '改成我的理解')
    await user.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => {
      expect(update).toHaveBeenCalledWith({ noteId: 'note_1', text: '改成我的理解' })
    })
    expect(await screen.findByText('改成我的理解')).toBeInTheDocument()
  })

  it('deletes a note after confirmation', async () => {
    const user = userEvent.setup()
    const { remove } = installBridge()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<NotesPanel />)

    await user.click(await screen.findByRole('button', { name: '删除' }))

    await waitFor(() => {
      expect(remove).toHaveBeenCalledWith('note_1')
    })
    expect(await screen.findByText(/还没有笔记/)).toBeInTheDocument()
    confirmSpy.mockRestore()
  })

  it('keeps the note when the delete confirmation is dismissed', async () => {
    const user = userEvent.setup()
    const { remove } = installBridge()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<NotesPanel />)

    await user.click(await screen.findByRole('button', { name: '删除' }))
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(remove).not.toHaveBeenCalled()
    expect(screen.queryByText(/还没有笔记/)).not.toBeInTheDocument()
    confirmSpy.mockRestore()
  })

  it('shows an empty state when there are no notes', async () => {
    installBridge({ notes: [] })
    render(<NotesPanel />)
    expect(await screen.findByText(/还没有笔记/)).toBeInTheDocument()
  })
})
