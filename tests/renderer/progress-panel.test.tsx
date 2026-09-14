/**
 * Tests for ProgressPanel — progress visualisation (F36).
 */
import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ProgressPanel } from '../../src/renderer/src/progress/ProgressPanel'
import type { SocratopiaAPI } from '../../src/preload'
import type { Conversation } from '../../src/shared/schemas/conversation'
import type { TextbookMetadata } from '../../src/shared/schemas/textbook'
import type { UsageSummary } from '../../src/shared/schemas/usage'
import { DEFAULT_PREFERENCES } from '../../src/shared/schemas/preferences'

afterEach(() => {
  cleanup()
  Reflect.deleteProperty(window, 'socratopia')
})

const textbooks: TextbookMetadata[] = [
  {
    id: 'tb_1' as TextbookMetadata['id'],
    worldId: 'world_default' as TextbookMetadata['worldId'],
    title: '牛顿力学',
    format: 'pdf',
    sourceFile: 'source.md',
    originalFile: 'original.pdf',
    progress: { currentPage: 2, totalPages: 10 },
    createdAt: '2026-09-10T09:00:00.000Z',
    updatedAt: '2026-09-14T09:00:00.000Z'
  },
  {
    id: 'tb_2' as TextbookMetadata['id'],
    worldId: 'world_default' as TextbookMetadata['worldId'],
    title: '课堂笔记',
    format: 'text',
    sourceFile: 'source.md',
    originalFile: null,
    progress: { currentPage: 3, totalPages: null },
    createdAt: '2026-09-11T09:00:00.000Z',
    updatedAt: '2026-09-13T09:00:00.000Z'
  }
]

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
    companionId: 'comp_alice' as Conversation['companionId'],
    textbookId: null,
    title: '进行中的课',
    createdAt: '2026-09-14T11:00:00.000Z',
    updatedAt: '2026-09-14T11:10:00.000Z',
    endedAt: null
  }
]

const usage: UsageSummary = {
  promptTokens: 1000,
  completionTokens: 500,
  totalTokens: 1500,
  calls: 3,
  days: [],
  models: []
}

function installBridge(): void {
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
      list: () => Promise.resolve(textbooks),
      get: () => Promise.reject(new Error('not used')),
      delete: () => Promise.reject(new Error('not used')),
      importFile: () => Promise.resolve(null)
    },
    conversations: {
      create: () => Promise.reject(new Error('not used')),
      list: () => Promise.resolve(conversations),
      get: () => Promise.reject(new Error('not used'))
    },
    messages: {
      append: () => Promise.reject(new Error('not used')),
      list: () => Promise.resolve([]),
      search: () => Promise.resolve([]),
      update: () => Promise.reject(new Error('not used'))
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
    stats: { get: () => Promise.resolve(usage) },
    archive: {
      exportBackup: () => Promise.resolve(null),
      restoreBackup: () => Promise.resolve(null),
      openDataFolder: () => Promise.resolve()
    }
  }
  window.socratopia = api
}

describe('ProgressPanel', () => {
  it('summarises textbooks, finished lessons and token usage', async () => {
    installBridge()
    render(<ProgressPanel onContinue={vi.fn()} onOpenConversation={vi.fn()} />)

    expect(await screen.findByText('牛顿力学')).toBeInTheDocument()
    expect(screen.getByText('已完成课堂')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('1,500')).toBeInTheDocument()
  })

  it('draws a progress bar only when total pages are known', async () => {
    installBridge()
    render(<ProgressPanel onContinue={vi.fn()} onOpenConversation={vi.fn()} />)

    const bar = await screen.findByRole('progressbar', { name: '牛顿力学 进度' })
    expect(bar).toHaveAttribute('aria-valuenow', '2')
    expect(bar).toHaveAttribute('aria-valuemax', '10')
    expect(screen.getByText('第 2 / 10 页 · 20%')).toBeInTheDocument()
    expect(
      screen.getByText(/当前位置：第 3 页（该格式没有总页数/)
    ).toBeInTheDocument()
  })

  it('continues learning with the selected textbook', async () => {
    const user = userEvent.setup()
    const onContinue = vi.fn()
    installBridge()
    render(<ProgressPanel onContinue={onContinue} onOpenConversation={vi.fn()} />)

    await user.click(await screen.findByText('牛顿力学'))
    const buttons = screen.getAllByRole('button', { name: '继续学习' })
    await user.click(buttons[0])

    expect(onContinue).toHaveBeenCalledWith(textbooks[0])
  })

  it('opens a finished lesson', async () => {
    const user = userEvent.setup()
    const onOpenConversation = vi.fn()
    installBridge()
    render(<ProgressPanel onContinue={vi.fn()} onOpenConversation={onOpenConversation} />)

    expect(await screen.findByText('最近完成的课堂')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '打开' }))

    expect(onOpenConversation).toHaveBeenCalledWith(conversations[0])
  })

  it('clamps an out-of-range page to the known total', async () => {
    installBridge()
    const overflowing = [...textbooks]
    overflowing[0] = {
      ...overflowing[0],
      progress: { currentPage: 150, totalPages: 24 }
    }
    // Reinstall with the overflowing book
    const api = window.socratopia as SocratopiaAPI
    window.socratopia = {
      ...api,
      textbooks: { ...api.textbooks, list: () => Promise.resolve(overflowing) }
    }

    render(<ProgressPanel onContinue={vi.fn()} onOpenConversation={vi.fn()} />)

    const bar = await screen.findByRole('progressbar', { name: '牛顿力学 进度' })
    expect(bar).toHaveAttribute('aria-valuenow', '24')
    expect(bar).toHaveAttribute('aria-valuemax', '24')
    expect(screen.getByText('第 24 / 24 页 · 100%')).toBeInTheDocument()
  })
})
