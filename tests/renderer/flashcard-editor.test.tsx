/**
 * Tests for FlashcardEditor — edit, add/remove, save and export (F12/F13).
 */
import React from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { FlashcardEditor } from '../../src/renderer/src/artifacts/FlashcardEditor'
import type { Flashcard } from '../../src/shared/schemas/artifact'

const cards: Flashcard[] = [
  { question: '什么是惯性？', answer: '保持运动状态', explanation: '第一章' }
]

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

beforeEach(() => {
  // jsdom lacks createObjectURL; provide a spy-friendly stub.
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
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
})

describe('FlashcardEditor', () => {
  it('renders editable fields for every card', () => {
    render(<FlashcardEditor flashcards={cards} />)

    expect(screen.getByLabelText('问题 1')).toHaveValue('什么是惯性？')
    expect(screen.getByLabelText('答案 1')).toHaveValue('保持运动状态')
    expect(screen.getByLabelText('解析 1')).toHaveValue('第一章')
  })

  it('saves edited cards through onSave', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<FlashcardEditor flashcards={cards} onSave={onSave} />)

    const question = screen.getByLabelText('问题 1')
    await user.clear(question)
    await user.type(question, '惯性指的是什么？')
    await user.click(screen.getByRole('button', { name: '保存修改' }))

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith([
        {
          question: '惯性指的是什么？',
          answer: '保持运动状态',
          explanation: '第一章'
        }
      ])
    })
    expect(await screen.findByText('已保存')).toBeInTheDocument()
  })

  it('adds and removes cards', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<FlashcardEditor flashcards={cards} onSave={onSave} />)

    await user.click(screen.getByRole('button', { name: '添加闪卡' }))
    expect(screen.getByLabelText('问题 2')).toBeInTheDocument()

    await user.click(screen.getAllByRole('button', { name: '删除' })[0])
    expect(screen.queryByLabelText('问题 2')).toBeNull()
    expect(screen.getByText('闪卡（1）')).toBeInTheDocument()
  })

  it('disables saving when a question or answer is empty', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<FlashcardEditor flashcards={cards} onSave={onSave} />)

    await user.clear(screen.getByLabelText('答案 1'))
    expect(screen.getByRole('button', { name: '保存修改' })).toBeDisabled()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('exports Markdown and TSV through local downloads', async () => {
    const user = userEvent.setup()
    render(<FlashcardEditor flashcards={cards} title="惯性课" />)

    await user.click(screen.getByRole('button', { name: '导出 Markdown' }))
    await user.click(screen.getByRole('button', { name: '导出 TXT（Anki）' }))

    expect(URL.createObjectURL).toHaveBeenCalledTimes(2)
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(2)
  })

  it('shows an empty state that allows adding a first card', async () => {
    const user = userEvent.setup()
    render(<FlashcardEditor flashcards={[]} />)

    expect(screen.getByText(/还没有闪卡/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '添加闪卡' }))
    expect(screen.getByLabelText('问题 1')).toBeInTheDocument()
  })
})
