/**
 * Security-first Markdown renderer tests.
 *
 * Tests cover: basic Markdown rendering, code blocks, KaTeX math,
 * raw HTML hardening, and unsafe link protocol blocking.
 *
 * Streamdown renders external links as <button data-streamdown="link">
 * for its built-in link safety. Tests target these button elements.
 */

import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MarkdownRenderer } from '../../src/renderer/src/chat/MarkdownRenderer'

describe('MarkdownRenderer', () => {
  // -------- Basic Markdown --------

  it('renders bold text and code blocks from Markdown', () => {
    const content = '**Key idea**\n\n```ts\nconst x: number = 1\n```'

    render(<MarkdownRenderer content={content} />)

    // Bold text is rendered
    expect(screen.getByText('Key idea')).toBeInTheDocument()
    // Code block content is rendered (fenced code block contains the code text)
    expect(screen.getByText(/const x/)).toBeInTheDocument()
  })

  // -------- Math --------

  it('renders KaTeX math for $E=mc^2$', () => {
    const { container } = render(<MarkdownRenderer content={'$E=mc^2$'} />)

    // KaTeX should add its class to the rendered math
    expect(container.querySelector('.katex')).not.toBeNull()
  })

  // -------- Security: Raw HTML --------

  it('does not execute or preserve raw HTML event handlers', () => {
    const { container } = render(
      <MarkdownRenderer content={'<img src=x onerror="alert(1)">'} />
    )

    // onerror attribute must not appear in the rendered output
    expect(container.querySelector('[onerror]')).toBeNull()
  })

  // -------- Security: Unsafe Link Protocols --------
  //
  // Streamdown renders all external links as <button data-streamdown="link">
  // for built-in link safety (confirmation modal).  rehype-harden runs before
  // this conversion, so unsafe protocols are stripped or the link is not
  // rendered at all.

  it('blocks javascript links', () => {
    const { container } = render(
      <MarkdownRenderer content={'[bad](javascript:alert(1))'} />
    )

    // Unsafe links must not produce link buttons
    const linkBtn = container.querySelector('[data-streamdown="link"]')
    expect(linkBtn).toBeNull()
  })

  it('blocks data: links', () => {
    const { container } = render(
      <MarkdownRenderer content={'[bad](data:text/html,<script>alert(1)</script>)'} />
    )

    const linkBtn = container.querySelector('[data-streamdown="link"]')
    expect(linkBtn).toBeNull()
  })

  it('blocks file: links', () => {
    const { container } = render(
      <MarkdownRenderer content={'[bad](file:///etc/passwd)'} />
    )

    const linkBtn = container.querySelector('[data-streamdown="link"]')
    expect(linkBtn).toBeNull()
  })

  it('blocks vbscript: links', () => {
    const { container } = render(
      <MarkdownRenderer content={'[bad](vbscript:msgbox(1))'} />
    )

    const linkBtn = container.querySelector('[data-streamdown="link"]')
    expect(linkBtn).toBeNull()
  })

  // -------- Security: Safe Links Still Work --------

  it('preserves safe https links', () => {
    const { container } = render(
      <MarkdownRenderer content={'[safe](https://example.com)'} />
    )

    // Safe links render as Streamdown link buttons
    const linkBtn = container.querySelector('[data-streamdown="link"]')
    expect(linkBtn).not.toBeNull()
    expect(linkBtn!.textContent).toBe('safe')
  })

  // -------- Italic / Inline Code --------

  it('renders italic text and inline code', () => {
    const { container } = render(
      <MarkdownRenderer content={'*emphasis* and `inline code`'} />
    )

    expect(screen.getByText('emphasis')).toBeInTheDocument()
    expect(screen.getByText('inline code')).toBeInTheDocument()
    // Italic text should be rendered inside an <em>
    expect(container.querySelector('em')).not.toBeNull()
  })
})