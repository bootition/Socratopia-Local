/**
 * Tests for EndClassButton — learner-triggered end-class flow (F04):
 * confirmation, artifact display, partial failure redo.
 */
import React from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { EndClassButton } from '../../src/renderer/src/artifacts/EndClassButton'
import type { SocratopiaAPI } from '../../src/preload'
import {
  ArtifactStatus,
  type EndClassRecord
} from '../../src/shared/schemas/artifact'
import { DEFAULT_PREFERENCES } from '../../src/shared/schemas/preferences'

afterEach(() => {
  cleanup()
  Reflect.deleteProperty(window, 'socratopia')
})

function makeRecord(overrides: Partial<EndClassRecord> = {}): EndClassRecord {
  return {
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
    flashcards: [
      { question: '什么是惯性？', answer: '保持运动状态的性质', explanation: '' }
    ],
    diary: '今天和 Alice 学了惯性。',
    progress: '当前页码：2',
    handoffTail: [],
    rawOutputFile: null,
    ...overrides
  }
}

function installBridge(options: {
  endClass?: SocratopiaAPI['artifacts']['endClass']
} = {}): { endClass: ReturnType<typeof vi.fn> } {
  const endClass = vi.fn(
    options.endClass ?? (() => Promise.resolve({ record: makeRecord(), failed: [] }))
  )

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
      list: () => Promise.resolve([]),
      get: () => Promise.reject(new Error('not used'))
    },
    messages: {
      append: () => Promise.reject(new Error('not used')),
      list: () => Promise.resolve([])
    },
    artifacts: {
      endClass: endClass as SocratopiaAPI['artifacts']['endClass'],
      get: () => Promise.resolve(null)
    }
  }

  window.socratopia = api
  return { endClass }
}

const baseProps = {
  conversationId: 'conv_1',
  companionId: 'comp_alice',
  textbookId: 'tb_1'
}

// ---------------------------------------------------------------
// Tests
// ---------------------------------------------------------------

describe('EndClassButton', () => {
  it('asks for confirmation and cancels without calling the API', async () => {
    const user = userEvent.setup()
    const { endClass } = installBridge()
    render(<EndClassButton {...baseProps} />)

    await user.click(screen.getByRole('button', { name: '下课' }))
    expect(screen.getByRole('dialog', { name: '确认下课' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '取消' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(endClass).not.toHaveBeenCalled()
  })

  it('generates artifacts on confirm and shows the result', async () => {
    const user = userEvent.setup()
    const onEnded = vi.fn()
    const { endClass } = installBridge()
    render(<EndClassButton {...baseProps} onEnded={onEnded} />)

    await user.click(screen.getByRole('button', { name: '下课' }))
    await user.click(screen.getByRole('button', { name: '确认下课' }))

    await waitFor(() => {
      expect(endClass).toHaveBeenCalledWith({
        conversationId: 'conv_1',
        companionId: 'comp_alice',
        textbookId: 'tb_1'
      })
    })

    expect(await screen.findByText('那么，下次见。')).toBeInTheDocument()
    expect(screen.getByText('本节理解惯性的直觉。')).toBeInTheDocument()
    expect(screen.getByText('什么是惯性？')).toBeInTheDocument()
    expect(screen.getByText('当前页码：2')).toBeInTheDocument()
    expect(onEnded).toHaveBeenCalled()
  })

  it('re-runs only the failed artifacts', async () => {
    const user = userEvent.setup()
    const endClass = vi
      .fn()
      .mockResolvedValueOnce({
        record: makeRecord({ flashcards: null }),
        failed: ['flashcards']
      })
      .mockResolvedValueOnce({ record: makeRecord(), failed: [] })
    installBridge({ endClass: endClass as SocratopiaAPI['artifacts']['endClass'] })
    render(<EndClassButton {...baseProps} />)

    await user.click(screen.getByRole('button', { name: '下课' }))
    await user.click(screen.getByRole('button', { name: '确认下课' }))

    expect(await screen.findByText(/未完成：闪卡/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '只重试未完成项' }))

    await waitFor(() => {
      expect(endClass).toHaveBeenCalledTimes(2)
    })
    expect(endClass.mock.calls[1][0]).toEqual({
      conversationId: 'conv_1',
      companionId: 'comp_alice',
      textbookId: 'tb_1',
      only: ['flashcards']
    })
    expect(await screen.findByText('什么是惯性？')).toBeInTheDocument()
  })

  it('shows an error when generation fails and allows a retry', async () => {
    const user = userEvent.setup()
    const endClass = vi
      .fn()
      .mockRejectedValueOnce(new Error('DeepSeek API error (HTTP 503)'))
      .mockResolvedValueOnce({ record: makeRecord(), failed: [] })
    installBridge({ endClass: endClass as SocratopiaAPI['artifacts']['endClass'] })
    render(<EndClassButton {...baseProps} />)

    await user.click(screen.getByRole('button', { name: '下课' }))
    await user.click(screen.getByRole('button', { name: '确认下课' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'DeepSeek API error (HTTP 503)'
    )

    await user.click(screen.getByRole('button', { name: '下课' }))
    await user.click(screen.getByRole('button', { name: '确认下课' }))

    expect(await screen.findByText('那么，下次见。')).toBeInTheDocument()
    expect(endClass).toHaveBeenCalledTimes(2)
  })

  it('disables the control while an answer is streaming', () => {
    installBridge()
    render(<EndClassButton {...baseProps} disabled />)
    expect(screen.getByRole('button', { name: '下课' })).toBeDisabled()
  })

  it('still retries failed artifacts after the classroom context is cleared', async () => {
    const user = userEvent.setup()
    const endClass = vi
      .fn()
      .mockResolvedValueOnce({
        record: makeRecord({ flashcards: null }),
        failed: ['flashcards']
      })
      .mockResolvedValueOnce({ record: makeRecord(), failed: [] })
    installBridge({ endClass: endClass as SocratopiaAPI['artifacts']['endClass'] })

    const onEnded = vi.fn()
    const { rerender } = render(
      <EndClassButton {...baseProps} onEnded={onEnded} />
    )

    await user.click(screen.getByRole('button', { name: '下课' }))
    await user.click(screen.getByRole('button', { name: '确认下课' }))
    await screen.findByText(/未完成：闪卡/)

    // Simulate ChatPanel clearing conversationId after the lesson ended.
    expect(onEnded).toHaveBeenCalled()
    rerender(<EndClassButton {...baseProps} conversationId={null} onEnded={onEnded} />)

    await user.click(screen.getByRole('button', { name: '只重试未完成项' }))

    await waitFor(() => {
      expect(endClass).toHaveBeenCalledTimes(2)
    })
    expect(endClass.mock.calls[1][0]).toMatchObject({
      conversationId: 'conv_1',
      only: ['flashcards']
    })
  })
})
