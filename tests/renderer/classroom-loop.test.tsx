/**
 * End-to-end classroom loop (Task 12):
 * key present → select companion → import textbook → send message →
 * streamed reply → assistant message persisted locally.
 *
 * Everything runs through the real App/SettingsGate/AppShell components
 * with a stateful mock of the preload bridge.
 */
import React from 'react'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'

import App from '../../src/renderer/src/App'
import type { SocratopiaAPI } from '../../src/preload'
import type { Companion } from '../../src/shared/schemas/companion'
import type { Message, MessageSource } from '../../src/shared/schemas/message'
import type { Textbook, TextbookMetadata } from '../../src/shared/schemas/textbook'
import type { Conversation } from '../../src/shared/schemas/conversation'
import { DEFAULT_PREFERENCES } from '../../src/shared/schemas/preferences'
import { CompanionGender, CompanionSource } from '../../src/shared/types/ids'

afterEach(() => {
  cleanup()
  Reflect.deleteProperty(window, 'socratopia')
})

const alice: Companion = {
  id: 'comp_alice' as Companion['id'],
  source: CompanionSource.Candidate,
  name: 'Alice',
  gender: CompanionGender.Female,
  age: 17,
  identity: '好奇的少女',
  personalityKeywords: ['好奇', '爱追问'],
  personality: '她对世界充满好奇。',
  speakingStyle: '她说话轻快。',
  emotionalExpressions: '她高兴时会笑。',
  originalFile: 'alice.md'
}

const holmes: Companion = {
  ...alice,
  id: 'comp_holmes' as Companion['id'],
  name: 'Holmes',
  identity: '冷静的侦探',
  originalFile: 'holmes.md'
}

interface LoopBridge {
  calls: string[]
  appended: Message[]
  streamRequest: Record<string, unknown> | null
  tokenCb: ((token: string) => void) | null
  endCb: ((finishReason: string) => void) | null
}

function createLoopBridge(
  options: {
    pastConversations?: Conversation[]
    pastMessages?: Message[]
    streamSources?: MessageSource[]
  } = {}
): LoopBridge {
  const calls: string[] = []
  const appended: Message[] = []
  const textbooks: TextbookMetadata[] = []

  const bridge: LoopBridge = {
    calls,
    appended,
    streamRequest: null,
    tokenCb: null,
    endCb: null
  }

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

    companions: {
      list: () => Promise.resolve([alice, holmes]),
      get: () => Promise.reject(new Error('not used'))
    },

    textbooks: {
      createFromText: (input) => {
        calls.push('textbook:create')
        const now = new Date().toISOString()
        const metadata: TextbookMetadata = {
          id: 'tb_1' as TextbookMetadata['id'],
          worldId: 'world_default' as TextbookMetadata['worldId'],
          title: input.title,
          format: input.format,
          sourceFile: 'source.md',
          progress: { currentPage: 0, totalPages: null },
          createdAt: now,
          updatedAt: now
        }
        textbooks.push(metadata)
        return Promise.resolve({ ...metadata, content: input.content } as Textbook)
      },
      list: () => Promise.resolve([...textbooks]),
      get: () => Promise.reject(new Error('not used'))
    },

    conversations: {
      create: (input) => {
        calls.push('conversation:create')
        const now = new Date().toISOString()
        return Promise.resolve({
          id: 'conv_1' as never,
          worldId: 'world_default' as never,
          companionId: input.companionId as never,
          textbookId: input.textbookId as never,
          title: input.title,
          createdAt: now,
          updatedAt: now,
          endedAt: null
        })
      },
      list: () => Promise.resolve(options.pastConversations ?? []),
      get: () => Promise.reject(new Error('not used'))
    },

    messages: {
      list: () => Promise.resolve(options.pastMessages ?? []),
      append: (input) => {
        calls.push(`message:append:${input.role}`)
        const message: Message = {
          id: `msg_${appended.length + 1}` as Message['id'],
          conversationId: input.conversationId as Message['conversationId'],
          role: input.role,
          content: input.content,
          createdAt: new Date().toISOString(),
          ...(input.sources !== undefined ? { sources: input.sources } : {})
        }
        appended.push(message)
        return Promise.resolve(message)
      }
    },

    chat: {
      startStream: (request) => {
        calls.push('stream:start')
        bridge.streamRequest = request as unknown as Record<string, unknown>
        return Promise.resolve({
          sessionId: 'sess_loop',
          sources: options.streamSources ?? []
        })
      },
      cancelStream: () => Promise.resolve(),
      onToken: (_sessionId, cb) => {
        bridge.tokenCb = cb
        return () => undefined
      },
      onError: () => () => undefined,
      onEnd: (_sessionId, cb) => {
        bridge.endCb = cb
        return () => undefined
      },
      onUsage: () => () => undefined
    }
  }

  window.socratopia = api
  return bridge
}

describe('classroom loop', () => {
  it('runs key → companion → textbook → streamed reply → persistence', async () => {
    const user = userEvent.setup()
    const grounding: MessageSource[] = [
      {
        segmentId: 'seg_1',
        label: '第一章 惯性 · 第 1 段',
        text: '物体保持静止或匀速直线运动。'
      }
    ]
    const bridge = createLoopBridge({ streamSources: grounding })

    render(<App />)

    // 1. Key is configured, so the shell appears.
    expect(await screen.findByText('Socratopia')).toBeInTheDocument()

    // 2. Select the companion.
    await user.click(screen.getByRole('button', { name: 'Companion' }))
    const aliceCard = await screen.findByRole('button', { name: /Alice/ })
    await user.click(aliceCard)
    expect(aliceCard).toHaveAttribute('aria-pressed', 'true')

    // 3. Import a textbook.
    await user.click(screen.getByRole('button', { name: 'Textbook' }))
    await user.type(await screen.findByLabelText('Textbook title'), '牛顿力学')
    await user.type(
      screen.getByLabelText('Content'),
      '# 第一章 惯性\n\n物体保持静止或匀速直线运动。'
    )
    await user.click(screen.getByRole('button', { name: 'Save textbook' }))

    await waitFor(() => {
      expect(bridge.calls).toContain('textbook:create')
    })

    // 4. Enter the classroom and send a message.
    await user.click(screen.getByRole('button', { name: 'Classroom' }))
    expect(await screen.findByText('与 Alice 对话')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Message'), '什么是惯性？{Enter}')

    await waitFor(() => {
      expect(bridge.streamRequest).not.toBeNull()
    })
    await waitFor(() => {
      expect(bridge.tokenCb).not.toBeNull()
      expect(bridge.endCb).not.toBeNull()
    })

    // 5. Stream the reply and finish.
    act(() => {
      bridge.tokenCb!('*她点点头。* ')
      bridge.tokenCb!('想想看：为什么刹车时人会前倾？')
    })
    expect(await screen.findByText(/为什么刹车时人会前倾/)).toBeInTheDocument()

    act(() => {
      bridge.endCb!('stop')
    })

    // 6. The assistant reply is persisted exactly once.
    await waitFor(() => {
      expect(
        bridge.appended.filter((m) => m.role === 'assistant')
      ).toHaveLength(1)
    })

    const assistant = bridge.appended.find((m) => m.role === 'assistant')!
    expect(assistant.content).toBe('*她点点头。* 想想看：为什么刹车时人会前倾？')
    // Grounding sources ride along with the persisted reply (F02)
    expect(assistant.sources).toEqual(grounding)

    // …and the learner can verify them from the reply itself.
    await user.click(await screen.findByRole('button', { name: '来源（1）' }))
    expect(screen.getByText('物体保持静止或匀速直线运动。')).toBeInTheDocument()

    // The user message was persisted before the stream started.
    expect(bridge.calls.indexOf('message:append:user')).toBeLessThan(
      bridge.calls.indexOf('stream:start')
    )

    // The prompt request carries the classroom context, not a prompt.
    expect(bridge.streamRequest).toMatchObject({
      companionId: 'comp_alice',
      textbookId: 'tb_1',
      conversationId: 'conv_1',
      userMessage: '什么是惯性？'
    })
  })

  it('opens a past conversation from history', async () => {
    const user = userEvent.setup()
    const past: Conversation = {
      id: 'conv_past_1' as Conversation['id'],
      worldId: 'world_default' as Conversation['worldId'],
      companionId: 'comp_alice' as Conversation['companionId'],
      textbookId: null,
      title: '惯性课',
      createdAt: '2026-09-10T09:00:00.000Z',
      updatedAt: '2026-09-10T09:30:00.000Z',
      endedAt: '2026-09-10T09:30:00.000Z'
    }
    const pastMessage: Message = {
      id: 'msg_past_1' as Message['id'],
      conversationId: past.id,
      role: 'assistant',
      content: '上次我们聊到了力。',
      createdAt: '2026-09-10T09:20:00.000Z'
    }
    createLoopBridge({ pastConversations: [past], pastMessages: [pastMessage] })

    render(<App />)
    await screen.findByText('Socratopia')

    await user.click(screen.getByRole('button', { name: 'History' }))
    expect(await screen.findByText('惯性课')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '打开' }))

    // Back in the classroom, with the past conversation restored
    expect(await screen.findByText('与 Alice 对话')).toBeInTheDocument()
    expect(await screen.findByText('上次我们聊到了力。')).toBeInTheDocument()
  })

  it('opens a lesson whose companion was deleted as a read-only view', async () => {
    const user = userEvent.setup()
    const orphaned: Conversation = {
      id: 'conv_orphan_1' as Conversation['id'],
      worldId: 'world_default' as Conversation['worldId'],
      companionId: 'comp_ghost' as Conversation['companionId'],
      textbookId: null,
      title: '幽灵角色课',
      createdAt: '2026-09-09T09:00:00.000Z',
      updatedAt: '2026-09-09T09:30:00.000Z',
      endedAt: null
    }
    const orphanMessage: Message = {
      id: 'msg_orphan_1' as Message['id'],
      conversationId: orphaned.id,
      role: 'assistant',
      content: '这是之前和已删除角色的对话。',
      createdAt: '2026-09-09T09:20:00.000Z'
    }
    createLoopBridge({
      pastConversations: [orphaned],
      pastMessages: [orphanMessage]
    })

    render(<App />)
    await screen.findByText('Socratopia')

    await user.click(screen.getByRole('button', { name: 'History' }))
    await screen.findByText('幽灵角色课')
    await user.click(screen.getByRole('button', { name: '打开' }))

    // The transcript is readable, but sending is disabled because the
    // companion no longer exists.
    expect(await screen.findByText('这是之前和已删除角色的对话。')).toBeInTheDocument()
    expect(screen.getByText('未选择同伴')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '发送' })).toBeDisabled()
  })
})
