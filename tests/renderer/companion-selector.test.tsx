/**
 * Companion selector tests.
 *
 * Covers the list-phase behavior required by Milestone 3 Task 8:
 *  - loading state renders while `companions.list()` is pending
 *  - all 9 reference companions render after `list()` resolves
 *  - cards show name, identity and the first 2-3 personality keywords
 *  - clicking a card selects it (`aria-pressed`) and calls `onSelect(id)`
 *  - cards are real buttons, so Enter activates them
 *  - API rejection renders an error state whose retry button re-calls `list()`
 *  - the list phase never calls `companions.get()`
 */

// `React` must be in scope: tests are transformed with the classic JSX
// runtime (see tests/renderer/app-shell.test.tsx).
import React, { useState, type ReactElement } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CompanionSelector } from '../../src/renderer/src/companions/CompanionSelector'
import { ClassroomProvider, useClassroom } from '../../src/renderer/src/context/ClassroomContext'
import type { Companion } from '../../src/shared/schemas/companion'
import type { CompanionId } from '../../src/shared/types/ids'
import type { SocratopiaAPI } from '../../src/preload'

// ---------------------------------------------------------------------------
// Fixtures: the 9 reference companions (metadata as loaded from index.json)
// ---------------------------------------------------------------------------

interface CompanionSeed {
  id: string
  name: string
  identity: string
  keywords: string[]
}

const COMPANION_SEEDS: readonly CompanionSeed[] = [
  {
    id: 'comp_alice',
    name: '爱丽丝',
    identity: '化工系本科一年级，少年大学生',
    keywords: ['好奇到底', '直觉先行']
  },
  {
    id: 'comp_holmes',
    name: '福尔摩斯',
    identity: '法医学实验室主任，来自英国',
    keywords: ['逻辑冷峻', '语言精确度洁癖', '对「看到了」那一刻有某种珍视']
  },
  {
    id: 'comp_huo_yunlai',
    name: '霍云来',
    identity: '生物系本科一年级',
    keywords: ['对小生物着迷', '注意力向外']
  },
  {
    id: 'comp_lu_yumeng',
    name: '鹿语萌',
    identity: '数学系本科一年级',
    keywords: ['表面疏冷毒舌', '内心温柔敏感', '又极度珍视眼前人', '爱护那些关心她的人']
  },
  {
    id: 'comp_meng_xu',
    name: '孟煦',
    identity: '历史系本科三年级',
    keywords: ['慵懒', '通透', '不紧不慢', '温煦如冬日暖阳']
  },
  {
    id: 'comp_qiu_lingni',
    name: '邱灵霓',
    identity: '计算机系本科一年级',
    keywords: ['热烈', '冒险', '冒失']
  },
  {
    id: 'comp_sun_wukong',
    name: '孙悟空',
    identity: '清华大学热能工程系青年特聘教授，海归',
    keywords: ['桀骜', '天才型自信']
  },
  {
    id: 'comp_tao_li',
    name: '陶砺',
    identity: '人工智能方向博士研究生一年级',
    keywords: ['沉稳', '儒雅', '可靠']
  },
  {
    id: 'comp_wen_ying',
    name: '闻莺',
    identity: '物理系本科一年级',
    keywords: ['骄傲', '锐利', '嘴硬心软', '完美主义']
  }
]

function toCompanion(seed: CompanionSeed): Companion {
  return {
    id: seed.id as CompanionId,
    source: 'candidate',
    name: seed.name,
    gender: 'female',
    age: 18,
    identity: seed.identity,
    personalityKeywords: seed.keywords,
    personality: `${seed.name} 的性格详写（测试数据）`,
    speakingStyle: '',
    emotionalExpressions: '',
    originalFile: `${seed.id}.md`
  }
}

const COMPANIONS: Companion[] = COMPANION_SEEDS.map(toCompanion)

// ---------------------------------------------------------------------------
// Preload bridge mock (complete SocratopiaAPI so the window type stays honest)
// ---------------------------------------------------------------------------

const listCompanions = vi.fn<() => Promise<Companion[]>>()
const getCompanion = vi.fn<() => Promise<never>>()

function notImplemented(name: string): () => Promise<never> {
  return () => Promise.reject(new Error(`${name} is not used in companion-selector tests`))
}

function createMockSocratopia(): SocratopiaAPI {
  return {
    getVersion: () => Promise.resolve('0.1.0'),
    getPlatform: () => Promise.resolve('win32'),
    settings: {
      hasDeepSeekKey: () => Promise.resolve(true),
      setDeepSeekKey: () => Promise.resolve(),
      deleteDeepSeekKey: () => Promise.resolve()
    },
    chat: {
      startStream: notImplemented('chat.startStream'),
      cancelStream: () => Promise.resolve(),
      onToken: () => () => undefined,
      onError: () => () => undefined,
      onEnd: () => () => undefined,
      onUsage: () => () => undefined
    },
    companions: {
      list: listCompanions,
      get: getCompanion
    },
    textbooks: {
      createFromText: notImplemented('textbooks.createFromText'),
      list: () => Promise.resolve([]),
      get: notImplemented('textbooks.get')
    },
    conversations: {
      create: notImplemented('conversations.create'),
      list: () => Promise.resolve([]),
      get: notImplemented('conversations.get')
    },
    messages: {
      append: notImplemented('messages.append'),
      list: () => Promise.resolve([])
    }
  }
}

beforeEach(() => {
  listCompanions.mockReset()
  listCompanions.mockResolvedValue(COMPANIONS)
  getCompanion.mockReset()
  getCompanion.mockRejectedValue(
    new Error('companions.get must not be called during the list phase')
  )

  Object.defineProperty(window, 'socratopia', {
    configurable: true,
    value: createMockSocratopia()
  })
})

afterEach(() => {
  cleanup()
  Reflect.deleteProperty(window, 'socratopia')
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Controlled parent mirroring how AppShell wires the selector to state. */
function ControlledHarness({
  onSelect
}: {
  onSelect: (companionId: string) => void
}): ReactElement {
  const [selectedId, setSelectedId] = useState<string | null>(null)

  return (
    <CompanionSelector
      selectedId={selectedId}
      onSelect={(companionId) => {
        setSelectedId(companionId)
        onSelect(companionId)
      }}
    />
  )
}

/** Exposes ClassroomContext state so the fallback wiring can be asserted. */
function ContextSelection(): ReactElement {
  const { companionId } = useClassroom()
  return <span data-testid="context-companion">{companionId ?? 'none'}</span>
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CompanionSelector', () => {
  it('renders a loading state while companions.list() is pending', () => {
    listCompanions.mockReturnValueOnce(new Promise<Companion[]>(() => {}))

    render(<CompanionSelector />)

    expect(screen.getByRole('status')).toHaveTextContent('正在加载同伴列表')
    // Only the "create custom companion" control is present while loading.
    expect(screen.queryAllByRole('button')).toHaveLength(1)
    expect(screen.queryByRole('button', { name: /爱丽丝/ })).toBeNull()
  })

  it('renders all 9 companion names after list() resolves', async () => {
    render(<CompanionSelector />)

    await screen.findByText('爱丽丝')

    for (const seed of COMPANION_SEEDS) {
      expect(screen.getByText(seed.name)).toBeInTheDocument()
    }

    // 9 companion cards (+1 header button for creating a custom companion)
    expect(screen.getAllByRole('listitem')).toHaveLength(9)
    expect(screen.getAllByRole('button')).toHaveLength(10)
    expect(listCompanions).toHaveBeenCalledTimes(1)
    expect(getCompanion).not.toHaveBeenCalled()
  })

  it('shows identity and at most the first three personality keywords', async () => {
    render(<CompanionSelector />)

    await screen.findByText('爱丽丝')

    expect(screen.getByText('化工系本科一年级，少年大学生')).toBeInTheDocument()

    // 鹿语萌 has four keywords; the list phase shows only the first three.
    expect(screen.getByText('表面疏冷毒舌')).toBeInTheDocument()
    expect(screen.getByText('内心温柔敏感')).toBeInTheDocument()
    expect(screen.getByText('又极度珍视眼前人')).toBeInTheDocument()
    expect(screen.queryByText('爱护那些关心她的人')).not.toBeInTheDocument()

    // 孟煦 also has four keywords.
    expect(screen.queryByText('温煦如冬日暖阳')).not.toBeInTheDocument()
  })

  it('marks the clicked card selected with aria-pressed and calls onSelect(id)', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()

    render(<ControlledHarness onSelect={onSelect} />)

    const alice = await screen.findByRole('button', { name: /爱丽丝/ })
    const holmes = screen.getByRole('button', { name: /福尔摩斯/ })

    expect(alice).toHaveAttribute('aria-pressed', 'false')

    await user.click(alice)

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith('comp_alice')
    expect(alice).toHaveAttribute('aria-pressed', 'true')
    expect(holmes).toHaveAttribute('aria-pressed', 'false')
  })

  it('selects with Enter because cards are real buttons', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()

    render(<ControlledHarness onSelect={onSelect} />)

    const holmes = await screen.findByRole('button', { name: /福尔摩斯/ })
    holmes.focus()
    expect(holmes).toHaveFocus()

    await user.keyboard('{Enter}')

    expect(onSelect).toHaveBeenCalledWith('comp_holmes')
    expect(holmes).toHaveAttribute('aria-pressed', 'true')
  })

  it('renders an error state with a retry button when list() rejects', async () => {
    listCompanions.mockRejectedValueOnce(new Error('IPC unavailable'))

    render(<CompanionSelector />)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('无法加载同伴列表')
    expect(alert).toHaveTextContent('IPC unavailable')
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument()
    expect(screen.queryByText('爱丽丝')).not.toBeInTheDocument()
  })

  it('re-calls list() when retry is clicked and renders companions on success', async () => {
    const user = userEvent.setup()
    listCompanions.mockRejectedValueOnce(new Error('temporary failure'))

    render(<CompanionSelector />)

    const retry = await screen.findByRole('button', { name: '重试' })
    await user.click(retry)

    expect(await screen.findByText('爱丽丝')).toBeInTheDocument()
    expect(listCompanions).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('falls back to ClassroomContext when no selection props are provided', async () => {
    const user = userEvent.setup()

    render(
      <ClassroomProvider>
        <CompanionSelector />
        <ContextSelection />
      </ClassroomProvider>
    )

    const alice = await screen.findByRole('button', { name: /爱丽丝/ })
    await user.click(alice)

    expect(alice).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('context-companion')).toHaveTextContent('comp_alice')
  })
})
