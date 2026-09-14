/**
 * Tests for StatsPanel — local usage & cost statistics (F15).
 */
import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { StatsPanel } from '../../src/renderer/src/stats/StatsPanel'
import type { SocratopiaAPI } from '../../src/preload'
import type { UsageSummary } from '../../src/shared/schemas/usage'
import {
  DEFAULT_PREFERENCES,
  TeachingPace,
  ChatModel,
  ReasoningEffort,
  ThemeMode
} from '../../src/shared/schemas/preferences'

afterEach(() => {
  cleanup()
  Reflect.deleteProperty(window, 'socratopia')
})

function summary(overrides: Partial<UsageSummary> = {}): UsageSummary {
  return {
    promptTokens: 1_000_000,
    completionTokens: 500_000,
    totalTokens: 1_500_000,
    calls: 12,
    days: [
      {
        date: '2026-09-14',
        promptTokens: 1_000_000,
        completionTokens: 500_000,
        totalTokens: 1_500_000,
        calls: 12
      }
    ],
    models: [
      {
        model: 'deepseek-v4-pro',
        promptTokens: 1_000_000,
        completionTokens: 500_000,
        totalTokens: 1_500_000,
        calls: 12
      }
    ],
    ...overrides
  }
}

function installBridge(options: {
  usage?: UsageSummary
  rates?: { input: number; output: number }
} = {}): void {
  const api: SocratopiaAPI = {
    getPlatform: () => Promise.resolve('win32'),
    getVersion: () => Promise.resolve('0.1.0'),
    settings: {
      hasDeepSeekKey: () => Promise.resolve(true),
      setDeepSeekKey: () => Promise.resolve(),
      deleteDeepSeekKey: () => Promise.resolve(),
      getPreferences: () =>
        Promise.resolve({
          ...DEFAULT_PREFERENCES,
          model: ChatModel.Pro,
          reasoningEffort: ReasoningEffort.High,
          pace: TeachingPace.Normal,
          theme: ThemeMode.Dark,
          pricePerMillionInput: options.rates?.input ?? 0,
          pricePerMillionOutput: options.rates?.output ?? 0
        }),
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
      list: () => Promise.resolve([]),
      search: () => Promise.resolve([])
    },
    artifacts: {
      endClass: () => Promise.reject(new Error('not used')),
      get: () => Promise.resolve(null)
    },
    stats: {
      get: () => Promise.resolve(options.usage ?? summary())
    }
  }
  window.socratopia = api
}

describe('StatsPanel', () => {
  it('renders totals, per-day and per-model rows', async () => {
    installBridge()
    render(<StatsPanel />)

    const totals = await screen.findAllByText('1,500,000')
    expect(totals.length).toBeGreaterThan(0)
    expect(screen.getAllByText('12').length).toBeGreaterThan(0)
    expect(screen.getByText('2026-09-14')).toBeInTheDocument()
    expect(screen.getByText('deepseek-v4-pro')).toBeInTheDocument()
  })

  it('shows an estimate once per-million rates are configured', async () => {
    installBridge({
      rates: { input: 2, output: 8 }
    })
    render(<StatsPanel />)

    // 1M input * 2 + 0.5M output * 8 = 6
    expect(await screen.findByText(/^6(\.0+)?（按设置中的单价）$/)).toBeInTheDocument()
  })

  it('prompts for rates when none are configured', async () => {
    installBridge()
    render(<StatsPanel />)

    expect(
      await screen.findByText('在 Settings 中填写每百万 token 单价后显示')
    ).toBeInTheDocument()
  })

  it('shows an empty state before any usage was recorded', async () => {
    installBridge({
      usage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        calls: 0,
        days: [],
        models: []
      }
    })
    render(<StatsPanel />)

    expect(await screen.findByText(/还没有用量记录/)).toBeInTheDocument()
  })

  it('surfaces a load error', async () => {
    installBridge()
    const failing: SocratopiaAPI = {
      ...(window.socratopia as SocratopiaAPI),
      stats: { get: vi.fn().mockRejectedValue(new Error('读取失败')) }
    }
    window.socratopia = failing
    render(<StatsPanel />)

    expect(await screen.findByRole('alert')).toHaveTextContent('读取失败')
  })
})
