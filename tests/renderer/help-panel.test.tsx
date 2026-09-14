/**
 * Tests for HelpPanel — offline help & quick reference (F32).
 */
import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { HelpPanel } from '../../src/renderer/src/help/HelpPanel'

afterEach(cleanup)

describe('HelpPanel', () => {
  it('renders the first-lesson workflow and shortcut reference', () => {
    render(<HelpPanel />)

    expect(screen.getByRole('heading', { name: '帮助与速查' })).toBeInTheDocument()
    expect(screen.getByText('第一节课怎么上')).toBeInTheDocument()
    expect(screen.getByText('Ctrl/Cmd + K')).toBeInTheDocument()
    expect(screen.getByText(/API Key 由主进程加密保存/)).toBeInTheDocument()
  })

  it('lists the implemented feature set and the current limitations', () => {
    render(<HelpPanel />)

    expect(screen.getByText('已实现的功能')).toBeInTheDocument()
    expect(screen.getByText(/本地公式计算器/)).toBeInTheDocument()
    expect(screen.getByText(/多格式教材导入/)).toBeInTheDocument()
    expect(screen.getByText(/教材导入已支持 Markdown/)).toBeInTheDocument()
    expect(screen.queryByText(/PDF\/EPUB\/DOCX 导入、/)).not.toBeInTheDocument()
  })
})
