/**
 * Tests for SettingsGate — first-run DeepSeek API key flow.
 *
 * The preload bridge is mocked with a typed SocratopiaAPI so the tests
 * run without Electron. Covered behavior:
 * - loading → setup form when no key
 * - validation prevents empty saves
 * - successful save reveals the app and clears the input
 * - save failure surfaces an error and stays on the gate
 * - a configured key renders children; deleting returns to the gate
 */
import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

import { SettingsGate, useSettings } from '../../src/renderer/src/settings/SettingsGate'
import { SettingsPanel } from '../../src/renderer/src/settings/SettingsPanel'
import type { SocratopiaAPI } from '../../src/preload'
import { DEFAULT_PREFERENCES } from '../../src/shared/schemas/preferences'

function notImplemented(): Promise<never> {
  return Promise.reject(new Error('Not implemented in settings gate test'))
}

interface MockOverrides {
  hasDeepSeekKey?: () => Promise<boolean>
  setDeepSeekKey?: (key: string) => Promise<void>
  deleteDeepSeekKey?: () => Promise<void>
  testDeepSeekKey?: (key?: string) => Promise<import('../../src/shared/schemas/settings').DeepSeekKeyTestResult>
}

function installMockSocratopia(overrides: MockOverrides = {}): {
  setDeepSeekKey: ReturnType<typeof vi.fn>
  deleteDeepSeekKey: ReturnType<typeof vi.fn>
  testDeepSeekKey: ReturnType<typeof vi.fn>
} {
  const setDeepSeekKey = vi.fn(overrides.setDeepSeekKey ?? (() => Promise.resolve()))
  const deleteDeepSeekKey = vi.fn(overrides.deleteDeepSeekKey ?? (() => Promise.resolve()))
  const testDeepSeekKey = vi.fn(
    overrides.testDeepSeekKey ??
      (() => Promise.resolve({ ok: true, model: 'deepseek-v4-pro', reply: '连接' }))
  )

  const mock: SocratopiaAPI = {
    getPlatform: () => Promise.resolve('win32'),
    getVersion: () => Promise.resolve('0.1.0'),
    settings: {
      hasDeepSeekKey: overrides.hasDeepSeekKey ?? (() => Promise.resolve(false)),
      setDeepSeekKey,
      deleteDeepSeekKey,
      getPreferences: () => Promise.resolve(DEFAULT_PREFERENCES),
      setPreferences: () => Promise.resolve(DEFAULT_PREFERENCES),
      testDeepSeekKey
    },
    chat: {
      startStream: () => notImplemented(),
      cancelStream: () => Promise.resolve(),
      onToken: () => () => undefined,
      onError: () => () => undefined,
      onEnd: () => () => undefined,
      onUsage: () => () => undefined
    },
    companions: {
      list: () => Promise.resolve([]),
      get: () => notImplemented()
    },
    textbooks: {
      createFromText: () => notImplemented(),
      list: () => Promise.resolve([]),
      get: () => notImplemented()
    },
    conversations: {
      create: () => notImplemented(),
      list: () => Promise.resolve([]),
      get: () => notImplemented()
    },
    messages: {
      append: () => notImplemented(),
      list: () => Promise.resolve([])
    }
  }

  window.socratopia = mock
  return { setDeepSeekKey, deleteDeepSeekKey, testDeepSeekKey }
}

function DeleteProbe(): React.ReactElement {
  const { deleteKey } = useSettings()
  return (
    <button type="button" onClick={() => void deleteKey()}>
      删除 Key
    </button>
  )
}

afterEach(() => {
  cleanup()
  Reflect.deleteProperty(window, 'socratopia')
})

// ---------------------------------------------------------------
// Missing key — setup form
// ---------------------------------------------------------------

describe('SettingsGate — missing key', () => {
  it('shows the setup form when no key is configured', async () => {
    installMockSocratopia({ hasDeepSeekKey: () => Promise.resolve(false) })
    render(
      <SettingsGate>
        <div>classroom</div>
      </SettingsGate>
    )

    expect(await screen.findByLabelText('API Key')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保存并进入课堂' })).toBeInTheDocument()
    expect(screen.queryByText('classroom')).toBeNull()
  })

  it('rejects an empty key without calling setDeepSeekKey', async () => {
    const user = userEvent.setup()
    const { setDeepSeekKey } = installMockSocratopia({
      hasDeepSeekKey: () => Promise.resolve(false)
    })
    render(
      <SettingsGate>
        <div>classroom</div>
      </SettingsGate>
    )

    await user.click(await screen.findByRole('button', { name: '保存并进入课堂' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('请输入 API Key')
    expect(setDeepSeekKey).not.toHaveBeenCalled()
    expect(screen.queryByText('classroom')).toBeNull()
  })

  it('saves a non-empty key, clears the input and reveals children', async () => {
    const user = userEvent.setup()
    const { setDeepSeekKey } = installMockSocratopia({
      hasDeepSeekKey: () => Promise.resolve(false)
    })
    render(
      <SettingsGate>
        <div>classroom</div>
      </SettingsGate>
    )

    const input = await screen.findByLabelText('API Key')
    await user.type(input, 'sk-test-key-123')
    await user.click(screen.getByRole('button', { name: '保存并进入课堂' }))

    await waitFor(() => {
      expect(setDeepSeekKey).toHaveBeenCalledWith('sk-test-key-123')
    })
    expect(await screen.findByText('classroom')).toBeInTheDocument()
    expect(screen.queryByLabelText('API Key')).toBeNull()
  })

  it('shows an error and stays on the gate when saving fails', async () => {
    const user = userEvent.setup()
    installMockSocratopia({
      hasDeepSeekKey: () => Promise.resolve(false),
      setDeepSeekKey: () => Promise.reject(new Error('Encryption is not available'))
    })
    render(
      <SettingsGate>
        <div>classroom</div>
      </SettingsGate>
    )

    await user.type(await screen.findByLabelText('API Key'), 'sk-broken')
    await user.click(screen.getByRole('button', { name: '保存并进入课堂' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Encryption is not available'
    )
    expect(screen.queryByText('classroom')).toBeNull()
  })
})

// ---------------------------------------------------------------
// Configured key — children + delete
// ---------------------------------------------------------------

describe('SettingsGate — configured key', () => {
  it('renders children directly when a key is configured', async () => {
    installMockSocratopia({ hasDeepSeekKey: () => Promise.resolve(true) })
    render(
      <SettingsGate>
        <div>classroom</div>
      </SettingsGate>
    )

    expect(await screen.findByText('classroom')).toBeInTheDocument()
    expect(screen.queryByLabelText('API Key')).toBeNull()
  })

  it('deleteKey removes the stored key and returns to the gate', async () => {
    const user = userEvent.setup()
    const { deleteDeepSeekKey } = installMockSocratopia({
      hasDeepSeekKey: () => Promise.resolve(true)
    })
    render(
      <SettingsGate>
        <div>
          classroom
          <DeleteProbe />
        </div>
      </SettingsGate>
    )

    await user.click(await screen.findByRole('button', { name: '删除 Key' }))

    await waitFor(() => {
      expect(deleteDeepSeekKey).toHaveBeenCalled()
    })
    expect(await screen.findByLabelText('API Key')).toBeInTheDocument()
    expect(screen.queryByText('classroom')).toBeNull()
  })
})

// ---------------------------------------------------------------
// 测试连接（Connection test）
// ---------------------------------------------------------------

describe('SettingsGate — connection test', () => {
  it('requires a key before testing', async () => {
    const user = userEvent.setup()
    const { testDeepSeekKey } = installMockSocratopia({
      hasDeepSeekKey: () => Promise.resolve(false)
    })
    render(
      <SettingsGate>
        <div>classroom</div>
      </SettingsGate>
    )

    await user.click(await screen.findByRole('button', { name: '测试连接（不保存）' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('请先输入 API Key')
    expect(testDeepSeekKey).not.toHaveBeenCalled()
  })

  it('reports success with the answering model', async () => {
    const user = userEvent.setup()
    const { testDeepSeekKey } = installMockSocratopia({
      hasDeepSeekKey: () => Promise.resolve(false),
      testDeepSeekKey: () =>
        Promise.resolve({ ok: true, model: 'deepseek-v4-flash', reply: '连接' })
    })
    render(
      <SettingsGate>
        <div>classroom</div>
      </SettingsGate>
    )

    await user.type(await screen.findByLabelText('API Key'), 'sk-test-123')
    await user.click(screen.getByRole('button', { name: '测试连接（不保存）' }))

    expect(await screen.findByRole('status')).toHaveTextContent(
      '连接成功：模型 deepseek-v4-flash 已响应'
    )
    expect(testDeepSeekKey).toHaveBeenCalledWith('sk-test-123')
  })

  it('reports a friendly failure message', async () => {
    const user = userEvent.setup()
    installMockSocratopia({
      hasDeepSeekKey: () => Promise.resolve(false),
      testDeepSeekKey: () =>
        Promise.resolve({
          ok: false,
          code: 'UNAUTHORIZED',
          message: 'API Key 无效或已过期，请在设置里重新填写。'
        })
    })
    render(
      <SettingsGate>
        <div>classroom</div>
      </SettingsGate>
    )

    await user.type(await screen.findByLabelText('API Key'), 'sk-bad')
    await user.click(screen.getByRole('button', { name: '测试连接（不保存）' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '连接失败：API Key 无效或已过期'
    )
  })
})

describe('SettingsPanel — connection test', () => {
  it('tests the stored key from the settings page', async () => {
    const user = userEvent.setup()
    const { testDeepSeekKey } = installMockSocratopia({
      hasDeepSeekKey: () => Promise.resolve(true),
      testDeepSeekKey: () =>
        Promise.resolve({ ok: true, model: 'deepseek-v4-pro', reply: '连接' })
    })

    render(
      <SettingsGate>
        <SettingsPanel preferences={DEFAULT_PREFERENCES} onChange={vi.fn()} />
      </SettingsGate>
    )

    await user.click(await screen.findByRole('button', { name: '测试连接' }))

    expect(await screen.findByRole('status')).toHaveTextContent(
      '连接成功：模型 deepseek-v4-pro 已响应'
    )
    expect(testDeepSeekKey).toHaveBeenCalledWith()
  })
})
