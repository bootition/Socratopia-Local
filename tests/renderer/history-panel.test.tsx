/**
 * Tests for HistoryPanel — past conversations + local keyword search (F20).
 */
import React from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { HistoryPanel } from '../../src/renderer/src/history/HistoryPanel'
import type { SocratopiaAPI } from '../../src/preload'
import type { Conversation } from '../../src/shared/schemas/conversation'
import type { MessageSearchHit } from '../../src/shared/schemas/message'
import {
  ArtifactStatus,
  type EndClassRecord
} from '../../src/shared/schemas/artifact'
import { DEFAULT_PREFERENCES } from '../../src/shared/schemas/preferences'

afterEach(() => {
  cleanup()
  Reflect.deleteProperty(window, 'socratopia')
})

const conversations: Conversation[] = [
  {
    id: 'conv_1' as Conversation['id'],
    worldId: 'world_default' as Conversation['worldId'],
    companionId: 'comp_alice' as Conversation['companionId'],
    textbookId: 'tb_1' as Conversation['textbookId'],
    title: '惯性课',
    createdAt: '2026-09-14T09:00:00.000Z',
    updatedAt: '2026-09-14T10:00:00.000Z',
    endedAt: '2026-09-14T10:00:00.000Z'
  },
  {
    id: 'conv_2' as Conversation['id'],
    worldId: 'world_default' as Conversation['worldId'],
    companionId: 'comp_holmes' as Conversation['companionId'],
    textbookId: null,
    title: '浮力课',
    createdAt: '2026-09-13T09:00:00.000Z',
    updatedAt: '2026-09-13T10:00:00.000Z',
    endedAt: null
  }
]

const hits: MessageSearchHit[] = [
  {
    conversationId: 'conv_1',
    messageId: 'msg_9',
    role: 'assistant',
    content: '想想刹车时人为什么会前倾——这就是惯性。',
    createdAt: '2026-09-14T09:30:00.000Z',
    conversationTitle: '惯性课'
  }
]

function installBridge(options: {
  list?: () => Promise<Conversation[]>
  search?: (query: string) => Promise<MessageSearchHit[]>
  getArtifacts?: (conversationId: string) => Promise<EndClassRecord | null>
  endClass?: (input: {
    conversationId: string
    companionId: string
    textbookId: string | null
    only?: string[]
  }) => Promise<{ record: EndClassRecord; failed: string[] }>
} = {}): {
  search: ReturnType<typeof vi.fn>
  getArtifacts: ReturnType<typeof vi.fn>
  endClass: ReturnType<typeof vi.fn>
} {
  const search = vi.fn(options.search ?? (() => Promise.resolve(hits)))
  const getArtifacts = vi.fn(options.getArtifacts ?? (() => Promise.resolve(null)))
  const endClass = vi.fn(options.endClass ?? (() => Promise.reject(new Error('not used'))))

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
      list: options.list ?? (() => Promise.resolve(conversations)),
      get: () => Promise.reject(new Error('not used'))
    },
    messages: {
      append: () => Promise.reject(new Error('not used')),
      list: () => Promise.resolve([]),
      search: search as SocratopiaAPI['messages']['search']
    },
    notes: {
      list: () => Promise.resolve([]),
      create: () => Promise.reject(new Error('not used')),
      update: () => Promise.reject(new Error('not used')),
      delete: () => Promise.resolve()
    },
    artifacts: {
      endClass: endClass as SocratopiaAPI['artifacts']['endClass'],
      get: getArtifacts as SocratopiaAPI['artifacts']['get'],
      updateFlashcards: () => Promise.reject(new Error('not used'))
    }
  }

  window.socratopia = api
  return { search, getArtifacts, endClass }
}

describe('HistoryPanel', () => {
  it('lists past conversations and opens one', async () => {
    const user = userEvent.setup()
    const onOpenConversation = vi.fn()
    installBridge()

    render(<HistoryPanel onOpenConversation={onOpenConversation} />)

    expect(await screen.findByText('惯性课')).toBeInTheDocument()
    expect(screen.getByText('浮力课')).toBeInTheDocument()
    expect(screen.getByText(/已下课/)).toBeInTheDocument()

    const openButtons = screen.getAllByRole('button', { name: '打开' })
    await user.click(openButtons[0])
    expect(onOpenConversation).toHaveBeenCalledWith(conversations[0])
  })

  it('validates the query before calling the search API', async () => {
    const user = userEvent.setup()
    const { search } = installBridge()
    render(<HistoryPanel onOpenConversation={vi.fn()} />)

    await user.type(await screen.findByLabelText('搜索消息'), '惯')
    await user.click(screen.getByRole('button', { name: '搜索' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('至少 2 个字符')
    expect(search).not.toHaveBeenCalled()
  })

  it('searches messages and opens a hit conversation', async () => {
    const user = userEvent.setup()
    const onOpenConversation = vi.fn()
    const { search } = installBridge()
    render(<HistoryPanel onOpenConversation={onOpenConversation} />)

    await screen.findByText('惯性课')
    await user.type(screen.getByLabelText('搜索消息'), '惯性')
    await user.click(screen.getByRole('button', { name: '搜索' }))

    await waitFor(() => {
      expect(search).toHaveBeenCalledWith('惯性')
    })

    expect(await screen.findByText(/刹车时人为什么会前倾/)).toBeInTheDocument()
    expect(screen.getByText('惯性课 ·', { exact: false })).toBeInTheDocument()

    await user.click(screen.getAllByRole('button', { name: '打开' })[0])
    expect(onOpenConversation).toHaveBeenCalledWith(conversations[0])
  })

  it('shows a load error instead of an empty state', async () => {
    installBridge({ list: () => Promise.reject(new Error('读取失败')) })
    render(<HistoryPanel onOpenConversation={vi.fn()} />)

    expect(await screen.findByRole('alert')).toHaveTextContent('读取失败')
  })

  it('shows an onboarding hint when there is no history', async () => {
    installBridge({ list: () => Promise.resolve([]) })
    render(<HistoryPanel onOpenConversation={vi.fn()} />)

    expect(
      await screen.findByText(/还没有历史课堂/)
    ).toBeInTheDocument()
  })

  it('shows stored end-class artifacts for a past lesson', async () => {
    const user = userEvent.setup()
    const record: EndClassRecord = {
      conversationId: 'conv_1',
      generatedAt: '2026-09-14T10:00:00.000Z',
      model: 'deepseek-v4-pro',
      farewell: '那么，下次见。',
      status: {
        lesson_summary: ArtifactStatus.Complete,
        flashcards: ArtifactStatus.Complete,
        diary: ArtifactStatus.Complete,
        progress: ArtifactStatus.Complete,
        handoff_tail: ArtifactStatus.Complete
      },
      summary: '本节理解惯性的直觉。',
      flashcards: [{ question: '什么是惯性？', answer: '保持运动状态', explanation: '' }],
      diary: '今天学了惯性。',
      progress: '当前页码：2',
      handoffTail: [],
      rawOutputFile: null
    }
    const { getArtifacts } = installBridge({
      getArtifacts: () => Promise.resolve(record)
    })
    render(<HistoryPanel onOpenConversation={vi.fn()} />)

    await screen.findByText('惯性课')
    await user.click(screen.getAllByRole('button', { name: '课后产物' })[0])

    await waitFor(() => {
      expect(getArtifacts).toHaveBeenCalledWith('conv_1')
    })
    expect(await screen.findByText('本节理解惯性的直觉。')).toBeInTheDocument()
    expect(screen.getByText('什么是惯性？')).toBeInTheDocument()

    // Clicking again collapses the artifact view
    await user.click(screen.getAllByRole('button', { name: '课后产物' })[0])
    expect(screen.queryByText('本节理解惯性的直觉。')).toBeNull()
  })

  it('exports a lesson as Markdown', async () => {
    const user = userEvent.setup()
    installBridge()
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: vi.fn(() => 'blob:mock')
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: vi.fn()
    })
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {})

    render(<HistoryPanel onOpenConversation={vi.fn()} />)
    await screen.findByText('惯性课')

    await user.click(screen.getAllByRole('button', { name: '导出课程' })[0])

    await waitFor(() => {
      expect(clickSpy).toHaveBeenCalled()
    })
    expect(URL.createObjectURL).toHaveBeenCalled()
    clickSpy.mockRestore()
  })

  it('retries failed artifacts of a stored lesson from the history view', async () => {
    const user = userEvent.setup()
    const record: EndClassRecord = {
      conversationId: 'conv_1',
      generatedAt: '2026-09-14T10:00:00.000Z',
      model: 'deepseek-v4-pro',
      farewell: '下次见。',
      status: {
        lesson_summary: ArtifactStatus.Complete,
        flashcards: ArtifactStatus.Failed,
        diary: ArtifactStatus.Complete,
        progress: ArtifactStatus.Complete,
        handoff_tail: ArtifactStatus.Complete
      },
      summary: '本节理解惯性。',
      flashcards: null,
      diary: '今天学了惯性。',
      progress: '当前页码：2',
      handoffTail: [],
      rawOutputFile: null
    }
    const endClass = vi.fn().mockResolvedValue({
      record: { ...record, flashcards: [{ question: 'q', answer: 'a', explanation: '' }], status: { ...record.status, flashcards: ArtifactStatus.Complete } },
      failed: []
    })
    installBridge({ getArtifacts: () => Promise.resolve(record), endClass })

    render(<HistoryPanel onOpenConversation={vi.fn()} />)
    await screen.findByText('惯性课')
    await user.click(screen.getAllByRole('button', { name: '课后产物' })[0])
    await screen.findByText(/未完成：闪卡/)

    await user.click(screen.getByRole('button', { name: '只重试未完成项' }))

    await waitFor(() => {
      expect(endClass).toHaveBeenCalledWith({
        conversationId: 'conv_1',
        companionId: 'comp_alice',
        textbookId: 'tb_1',
        only: ['flashcards']
      })
    })
  })
})
