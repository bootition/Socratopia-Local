/**
 * Tests for custom companion management in CompanionSelector (F34).
 */
import React from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CompanionSelector } from '../../src/renderer/src/companions/CompanionSelector'
import {
  ClassroomProvider,
  useClassroom
} from '../../src/renderer/src/context/ClassroomContext'
import type { SocratopiaAPI } from '../../src/preload'
import type { Companion, CustomCompanionInput } from '../../src/shared/schemas/companion'
import { DEFAULT_PREFERENCES } from '../../src/shared/schemas/preferences'

afterEach(() => {
  cleanup()
  Reflect.deleteProperty(window, 'socratopia')
  vi.restoreAllMocks()
})

const candidate: Companion = {
  id: 'comp_alice' as Companion['id'],
  source: 'candidate',
  name: 'Alice',
  gender: 'female',
  age: 17,
  identity: '好奇的少女',
  personalityKeywords: ['好奇'],
  personality: '她对世界充满好奇。',
  speakingStyle: '',
  emotionalExpressions: '',
  originalFile: 'alice.md'
}

const customBob: Companion = {
  id: 'comp_custom_bob' as Companion['id'],
  source: 'custom',
  name: 'Bob',
  gender: 'male',
  age: 22,
  identity: '耐心的助教',
  personalityKeywords: ['耐心'],
  personality: '他喜欢一步步引导。',
  speakingStyle: '慢条斯理。',
  emotionalExpressions: '',
  originalFile: 'comp_custom_bob.md'
}

function installBridge(): {
  createCustom: ReturnType<typeof vi.fn>
  updateCustom: ReturnType<typeof vi.fn>
  deleteCustom: ReturnType<typeof vi.fn>
} {
  let companions: Companion[] = [candidate, customBob]

  const createCustom = vi.fn(async (input: CustomCompanionInput) => {
    const created: Companion = {
      id: `comp_custom_${companions.length}` as Companion['id'],
      source: 'custom',
      name: input.name,
      gender: input.gender,
      age: input.age,
      identity: input.identity,
      personalityKeywords: input.personalityKeywords,
      personality: input.personality,
      speakingStyle: input.speakingStyle,
      emotionalExpressions: input.emotionalExpressions,
      originalFile: 'comp_custom_new.md'
    }
    companions = [...companions, created]
    return created
  })

  const updateCustom = vi.fn(async (id: string, input: CustomCompanionInput) => {
    const updated: Companion = {
      ...(companions.find((c) => c.id === id) ?? customBob),
      ...input
    }
    companions = companions.map((c) => (c.id === id ? updated : c))
    return updated
  })

  const deleteCustom = vi.fn(async (id: string) => {
    companions = companions.filter((c) => c.id !== id)
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
    companions: {
      list: () => Promise.resolve([...companions]),
      get: () => Promise.reject(new Error('not used')),
      createCustom: createCustom as SocratopiaAPI['companions']['createCustom'],
      updateCustom: updateCustom as SocratopiaAPI['companions']['updateCustom'],
      deleteCustom: deleteCustom as SocratopiaAPI['companions']['deleteCustom']
    },
    textbooks: {
      createFromText: () => Promise.reject(new Error('not used')),
      list: () => Promise.resolve([]),
      get: () => Promise.reject(new Error('not used')),
      delete: () => Promise.reject(new Error('not used')),
      importFile: () => Promise.resolve(null)
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
    chat: {
      startStream: () => Promise.reject(new Error('not used')),
      cancelStream: () => Promise.resolve(),
      onToken: () => () => undefined,
      onError: () => () => undefined,
      onEnd: () => () => undefined,
      onUsage: () => () => undefined
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
  return { createCustom, updateCustom, deleteCustom }
}

function renderSelector(): void {
  render(
    <ClassroomProvider>
      <CompanionSelector />
    </ClassroomProvider>
  )
}

describe('CompanionSelector — custom companions', () => {
  it('only offers edit/delete for custom companions', async () => {
    installBridge()
    renderSelector()

    await screen.findByText('Bob')
    expect(screen.getByRole('button', { name: '编辑' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '删除' })).toBeInTheDocument()

    // The candidate card has no management controls: exactly one pair exists.
    expect(screen.getAllByRole('button', { name: '编辑' })).toHaveLength(1)
  })

  it('creates a custom companion from the form', async () => {
    const user = userEvent.setup()
    const { createCustom } = installBridge()
    renderSelector()

    await user.click(await screen.findByRole('button', { name: '新建自定义角色' }))

    await user.type(screen.getByLabelText('名字'), '小助手')
    await user.type(screen.getByLabelText('身份'), '学习伙伴')
    await user.type(screen.getByLabelText('性格关键词（用、或逗号分隔）'), '耐心、幽默')
    await user.type(screen.getByLabelText('性格详写'), '他喜欢用问题引导。')
    await user.click(screen.getByRole('button', { name: '创建角色' }))

    await waitFor(() => {
      expect(createCustom).toHaveBeenCalledTimes(1)
    })
    expect(createCustom.mock.calls[0][0]).toMatchObject({
      name: '小助手',
      identity: '学习伙伴',
      personalityKeywords: ['耐心', '幽默'],
      personality: '他喜欢用问题引导。'
    })
    expect(await screen.findByText('小助手')).toBeInTheDocument()
  })

  it('validates the form before calling the API', async () => {
    const user = userEvent.setup()
    const { createCustom } = installBridge()
    renderSelector()

    await user.click(await screen.findByRole('button', { name: '新建自定义角色' }))
    await user.click(screen.getByRole('button', { name: '创建角色' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('名字和身份不能为空')
    expect(createCustom).not.toHaveBeenCalled()
  })

  it('edits an existing custom companion', async () => {
    const user = userEvent.setup()
    const { updateCustom } = installBridge()
    renderSelector()

    await user.click(await screen.findByRole('button', { name: '编辑' }))

    const nameInput = screen.getByLabelText('名字')
    expect(nameInput).toHaveValue('Bob')
    await user.clear(nameInput)
    await user.type(nameInput, 'Bobby')
    await user.click(screen.getByRole('button', { name: '保存修改' }))

    await waitFor(() => {
      expect(updateCustom).toHaveBeenCalledTimes(1)
    })
    expect(updateCustom.mock.calls[0][0]).toBe('comp_custom_bob')
    expect(await screen.findByText('Bobby')).toBeInTheDocument()
  })

  it('deletes a custom companion after confirmation', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { deleteCustom } = installBridge()
    renderSelector()

    await screen.findByText('Bob')
    await user.click(screen.getByRole('button', { name: '删除' }))

    await waitFor(() => {
      expect(deleteCustom).toHaveBeenCalledWith('comp_custom_bob')
    })
    await waitFor(() => {
      expect(screen.queryByText('Bob')).toBeNull()
    })
  })
})

describe('CompanionSelector — conversation reset', () => {
  it('switching companions ends the current conversation', async () => {
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
        <CompanionSelector />
        <ConversationAutoSet />
      </ClassroomProvider>
    )

    await screen.findByText('Alice')
    expect(screen.getByTestId('conversation').textContent).toBe('conv_x')

    await user.click(screen.getByRole('button', { name: /Alice/ }))

    await waitFor(() => {
      expect(screen.getByTestId('conversation').textContent).toBe('null')
    })
  })
})
