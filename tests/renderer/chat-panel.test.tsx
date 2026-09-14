/**
 * Tests for ChatPanel + useConversation — the classroom streaming loop.
 *
 * The preload bridge is mocked. Verified behaviour:
 * - first send creates the conversation and appends the user message
 *   BEFORE the stream starts (a failure must never lose the question),
 * - token events update the live assistant draft,
 * - the end event persists the assistant reply exactly once,
 * - stream start errors show a retry control and keep the user message,
 * - an existing conversation is loaded from the message store.
 */
import React, { useEffect } from 'react'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'

import { ChatPanel } from '../../src/renderer/src/chat/ChatPanel'
import {
  ClassroomProvider,
  useClassroom
} from '../../src/renderer/src/context/ClassroomContext'
import type { SocratopiaAPI } from '../../src/preload'
import type { Message } from '../../src/shared/schemas/message'
import { DEFAULT_PREFERENCES } from '../../src/shared/schemas/preferences'

afterEach(() => {
  cleanup()
  Reflect.deleteProperty(window, 'socratopia')
})

// ---------------------------------------------------------------
// Mock bridge
// ---------------------------------------------------------------

interface FakeBridge {
  calls: string[]
  appended: Message[]
  streamRequest: Record<string, unknown> | null
  tokenCb: ((token: string) => void) | null
  endCb: ((finishReason: string) => void) | null
  errorCb: ((error: { code: string; message: string }) => void) | null
}

function makeMessage(
  role: Message['role'],
  content: string,
  conversationId = 'conv_1'
): Message {
  return {
    id: `msg_${role}_${content.slice(0, 4)}`,
    conversationId: conversationId as Message['conversationId'],
    role,
    content,
    createdAt: new Date().toISOString()
  }
}

function installBridge(options: {
  startError?: Error
  loadedMessages?: Message[]
} = {}): FakeBridge {
  const calls: string[] = []
  const appended: Message[] = []

  const bridge: FakeBridge = {
    calls,
    appended,
    streamRequest: null,
    tokenCb: null,
    endCb: null,
    errorCb: null
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
      list: () => Promise.resolve([]),
      get: () => Promise.reject(new Error('not used'))
    },
    textbooks: {
      createFromText: () => Promise.reject(new Error('not used')),
      list: () => Promise.resolve([]),
      get: () => Promise.reject(new Error('not used'))
    },
    conversations: {
      create: (input) => {
        calls.push('create')
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
      list: () => Promise.resolve([]),
      get: () => Promise.reject(new Error('not used'))
    },
    messages: {
      list: (conversationId) => {
        calls.push('list')
        return Promise.resolve(options.loadedMessages ?? []).then((msgs) =>
          msgs.map((m) => ({ ...m, conversationId }))
        )
      },
      append: (input) => {
        calls.push(`append:${input.role}`)
        const message = makeMessage(
          input.role,
          input.content,
          input.conversationId
        )
        appended.push(message)
        return Promise.resolve(message)
      }
    },
    chat: {
      startStream: (request) => {
        calls.push('stream')
        bridge.streamRequest = request as unknown as Record<string, unknown>
        if (options.startError) return Promise.reject(options.startError)
        return Promise.resolve({ sessionId: 'sess_1', sources: [] })
      },
      cancelStream: () => {
        calls.push('cancel')
        return Promise.resolve()
      },
      onToken: (_sessionId, cb) => {
        bridge.tokenCb = cb
        return () => undefined
      },
      onError: (_sessionId, cb) => {
        bridge.errorCb = cb
        return () => undefined
      },
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

function renderPanel(props: {
  companionId: string | null
  companionName?: string | null
  textbookId: string | null
}): ReturnType<typeof render> {
  return render(
    <ClassroomProvider>
      <ChatPanel
        companionId={props.companionId}
        companionName={props.companionName ?? 'Alice'}
        textbookId={props.textbookId}
        preferences={DEFAULT_PREFERENCES}
      />
    </ClassroomProvider>
  )
}

async function waitForStreamSetup(bridge: FakeBridge): Promise<void> {
  await waitFor(() => {
    expect(bridge.tokenCb).not.toBeNull()
    expect(bridge.endCb).not.toBeNull()
  })
}

// ---------------------------------------------------------------
// Tests
// ---------------------------------------------------------------

describe('ChatPanel', () => {
  it('creates the conversation and persists the user message before streaming', async () => {
    const user = userEvent.setup()
    const bridge = installBridge()
    renderPanel({ companionId: 'comp_alice', textbookId: 'tb_1' })

    await user.type(screen.getByLabelText('Message'), '什么是惯性？{Enter}')
    await waitForStreamSetup(bridge)

    expect(bridge.calls.indexOf('create')).toBeGreaterThanOrEqual(0)
    expect(bridge.calls.indexOf('append:user')).toBeGreaterThan(
      bridge.calls.indexOf('create')
    )
    expect(bridge.calls.indexOf('stream')).toBeGreaterThan(
      bridge.calls.indexOf('append:user')
    )

    expect(bridge.streamRequest).toMatchObject({
      companionId: 'comp_alice',
      textbookId: 'tb_1',
      conversationId: 'conv_1',
      userMessage: '什么是惯性？'
    })
    expect(screen.getByText('什么是惯性？')).toBeInTheDocument()
  })

  it('shows token events as a live draft and persists the reply once on end', async () => {
    const user = userEvent.setup()
    const bridge = installBridge()
    renderPanel({ companionId: 'comp_alice', textbookId: null })

    await user.type(screen.getByLabelText('Message'), '讲讲惯性{Enter}')
    await waitForStreamSetup(bridge)

    act(() => {
      bridge.tokenCb!('*她点点头。* ')
      bridge.tokenCb!('想一想为什么。')
    })

    expect(await screen.findByText(/想一想为什么/)).toBeInTheDocument()

    act(() => {
      bridge.endCb!('stop')
    })

    await waitFor(() => {
      expect(
        bridge.appended.filter((m) => m.role === 'assistant')
      ).toHaveLength(1)
    })
    expect(
      bridge.appended.find((m) => m.role === 'assistant')!.content
    ).toBe('*她点点头。* 想一想为什么。')
  })

  it('keeps the user message and offers retry when the stream fails to start', async () => {
    const user = userEvent.setup()
    const bridge = installBridge({ startError: new Error('Connection refused') })
    renderPanel({ companionId: 'comp_alice', textbookId: null })

    await user.type(screen.getByLabelText('Message'), '再试一次{Enter}')

    expect(await screen.findByRole('alert')).toHaveTextContent('Connection refused')
    expect(bridge.calls).toContain('append:user')
    expect(screen.getByText('再试一次')).toBeInTheDocument()

    const retry = screen.getByRole('button', { name: '重试' })
    expect(retry).toBeEnabled()
  })

  it('loads persisted messages for an already selected conversation', async () => {
    const loaded = [makeMessage('assistant', '上次我们聊到了力。')]
    const bridge = installBridge({ loadedMessages: loaded })

    function ConversationSetter(): null {
      const { setConversationId } = useClassroom()
      useEffect(() => {
        setConversationId('conv_existing')
      }, [setConversationId])
      return null
    }

    render(
      <ClassroomProvider>
        <ConversationSetter />
        <ChatPanel
          companionId="comp_alice"
          companionName="Alice"
          textbookId={null}
          preferences={DEFAULT_PREFERENCES}
        />
      </ClassroomProvider>
    )

    expect(await screen.findByText('上次我们聊到了力。')).toBeInTheDocument()
    expect(bridge.calls).toContain('list')
  })

  it('disables sending until a companion is selected', () => {
    installBridge()
    renderPanel({ companionId: null, textbookId: null })

    expect(screen.getByText('未选择同伴')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '发送' })).toBeDisabled()
  })
})
