/**
 * Tests for TextbookLibrary — list / select / delete (F21).
 */
import React from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { TextbookLibrary } from '../../src/renderer/src/textbooks/TextbookLibrary'
import {
  ClassroomProvider,
  useClassroom
} from '../../src/renderer/src/context/ClassroomContext'
import type { SocratopiaAPI } from '../../src/preload'
import type { TextbookMetadata } from '../../src/shared/schemas/textbook'
import { DEFAULT_PREFERENCES } from '../../src/shared/schemas/preferences'

afterEach(() => {
  cleanup()
  Reflect.deleteProperty(window, 'socratopia')
  vi.restoreAllMocks()
})

const books: TextbookMetadata[] = [
  {
    id: 'tb_1' as TextbookMetadata['id'],
    worldId: 'world_default' as TextbookMetadata['worldId'],
    title: '牛顿力学',
    format: 'markdown',
    sourceFile: 'source.md',
    progress: { currentPage: 2, totalPages: null },
    createdAt: '2026-09-10T09:00:00.000Z',
    updatedAt: '2026-09-14T09:00:00.000Z'
  },
  {
    id: 'tb_2' as TextbookMetadata['id'],
    worldId: 'world_default' as TextbookMetadata['worldId'],
    title: '浮力讲义',
    format: 'text',
    sourceFile: 'source.md',
    progress: { currentPage: 0, totalPages: null },
    createdAt: '2026-09-11T09:00:00.000Z',
    updatedAt: '2026-09-11T09:00:00.000Z'
  }
]

function installBridge(options: {
  books?: TextbookMetadata[]
  orphans?: string[]
} = {}): {
  remove: ReturnType<typeof vi.fn>
  cleanupOrphans: ReturnType<typeof vi.fn>
} {
  const remove = vi.fn().mockResolvedValue(undefined)
  let orphans = [...(options.orphans ?? [])]
  const cleanupOrphans = vi.fn().mockImplementation(() => {
    const count = orphans.length
    orphans = []
    return Promise.resolve(count)
  })

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
    textbooks: {
      createFromText: () => Promise.reject(new Error('not used')),
      list: () => Promise.resolve(options.books ?? books),
      get: () => Promise.reject(new Error('not used')),
      delete: remove as SocratopiaAPI['textbooks']['delete'],
      getPage: () => Promise.resolve(null),
      listOrphans: () => Promise.resolve(orphans),
      cleanupOrphans: cleanupOrphans as SocratopiaAPI['textbooks']['cleanupOrphans'],
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
    conversations: {
      create: () => Promise.reject(new Error('not used')),
      list: () => Promise.resolve([]),
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
    notes: {
      list: () => Promise.resolve([]),
      create: () => Promise.reject(new Error('not used')),
      update: () => Promise.reject(new Error('not used')),
      delete: () => Promise.resolve()
    },
    stats: { get: () => Promise.reject(new Error('not used')) },
    archive: {
      exportBackup: () => Promise.resolve(null),
      restoreBackup: () => Promise.resolve(null),
      openDataFolder: () => Promise.resolve()
    }
  }

  window.socratopia = api
  return { remove, cleanupOrphans }
}

function SelectedProbe(): React.ReactElement {
  const { textbookId } = useClassroom()
  return <span data-testid="selected">{textbookId ?? 'null'}</span>
}

function renderLibrary(): void {
  render(
    <ClassroomProvider>
      <TextbookLibrary />
      <SelectedProbe />
    </ClassroomProvider>
  )
}

describe('TextbookLibrary', () => {
  it('lists textbooks with format and progress', async () => {
    installBridge()
    renderLibrary()

    expect(await screen.findByText('牛顿力学')).toBeInTheDocument()
    expect(screen.getByText('浮力讲义')).toBeInTheDocument()
    expect(screen.getByText(/Markdown · 进度 第 2 页/)).toBeInTheDocument()
    expect(screen.getByText(/纯文本 · 进度 第 0 页/)).toBeInTheDocument()
  })

  it('selects a textbook into the classroom context', async () => {
    const user = userEvent.setup()
    installBridge()
    renderLibrary()

    await screen.findByText('浮力讲义')
    await user.click(screen.getAllByRole('button', { name: '选择' })[1])

    expect(screen.getByTestId('selected').textContent).toBe('tb_2')
    expect(screen.getByRole('button', { name: '已选择' })).toBeInTheDocument()
  })

  it('deletes after confirmation and clears the selection', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { remove } = installBridge()
    renderLibrary()

    await screen.findByText('牛顿力学')
    await user.click(screen.getAllByRole('button', { name: '选择' })[0])
    await user.click(screen.getAllByRole('button', { name: '删除' })[0])

    await waitFor(() => {
      expect(remove).toHaveBeenCalledWith('tb_1')
    })
    expect(screen.queryByText('牛顿力学')).toBeNull()
    expect(screen.getByTestId('selected').textContent).toBe('null')
  })

  it('does nothing when the confirmation is cancelled', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { remove } = installBridge()
    renderLibrary()

    await screen.findByText('牛顿力学')
    await user.click(screen.getAllByRole('button', { name: '删除' })[0])

    expect(remove).not.toHaveBeenCalled()
    expect(screen.getByText('牛顿力学')).toBeInTheDocument()
  })

  it('shows an empty state', async () => {
    installBridge({ books: [] })
    renderLibrary()
    expect(await screen.findByText(/还没有教材/)).toBeInTheDocument()
  })

  it('switching textbooks ends the current conversation', async () => {
    const user = userEvent.setup()
    installBridge()

    function ConversationAutoSet(): React.ReactElement {
      const { conversationId, setConversationId } = useClassroom()
      React.useEffect(() => {
        setConversationId('conv_x')
      }, [setConversationId])
      return <span data-testid="conversation">{conversationId ?? 'null'}</span>
    }

    render(
      <ClassroomProvider>
        <TextbookLibrary />
        <ConversationAutoSet />
      </ClassroomProvider>
    )

    await screen.findByText('牛顿力学')
    expect(screen.getByTestId('conversation').textContent).toBe('conv_x')

    await user.click(screen.getAllByRole('button', { name: '选择' })[0])

    await waitFor(() => {
      expect(screen.getByTestId('conversation').textContent).toBe('null')
    })
  })

  it('offers to clean up unreadable textbook directories', async () => {
    const user = userEvent.setup()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { cleanupOrphans } = installBridge({
      orphans: ['tb_interrupted_1', 'tb_corrupt_2']
    })

    render(
      <ClassroomProvider>
        <TextbookLibrary />
      </ClassroomProvider>
    )

    expect(await screen.findByText(/发现 2 个无法读取的教材目录/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '清理' }))

    await waitFor(() => {
      expect(cleanupOrphans).toHaveBeenCalledTimes(1)
      expect(screen.queryByText(/无法读取的教材目录/)).toBeNull()
    })
    confirmSpy.mockRestore()
  })
})
