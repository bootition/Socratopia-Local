import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { ReadingWindow } from '../../src/renderer/src/chat/ReadingWindow'
import type { SocratopiaAPI } from '../../src/preload'

type PageResult = { page: number; totalPages: number; text: string } | null

function installBridge(getPage: (textbookId: string, page: number) => Promise<PageResult>): void {
  window.socratopia = { textbooks: { getPage } } as unknown as SocratopiaAPI
}

describe('ReadingWindow', () => {
  it('renders nothing for textbooks without page data', async () => {
    installBridge(() => Promise.resolve(null))
    const { container } = render(
      <ReadingWindow textbookId="tb_1" title="Markdown 教材" initialPage={0} />
    )

    await screen.findByText(/Markdown 教材/)
    // While loading the shell is shown, then it disappears once null is known.
    await vi.waitFor(() => {
      expect(container.textContent).not.toContain('阅读窗口')
    })
  })

  it('shows the page text and flips pages locally', async () => {
    const user = userEvent.setup()
    const getPage = vi.fn((_id: string, page: number) =>
      Promise.resolve({
        page,
        totalPages: 3,
        text: `第 ${page} 页的文字`
      })
    )
    installBridge(getPage)

    render(<ReadingWindow textbookId="tb_1" title="PDF 教材" initialPage={0} />)

    const toggle = await screen.findByRole('button', { name: /阅读窗口：PDF 教材 · 第 1 \/ 3 页/ })
    await user.click(toggle)

    expect(await screen.findByText('第 1 页的文字')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '上一页' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: '下一页' }))

    expect(await screen.findByText('第 2 页的文字')).toBeInTheDocument()
    expect(getPage).toHaveBeenLastCalledWith('tb_1', 2)
  })

  it('starts at the page the learner reached last lesson', async () => {
    const user = userEvent.setup()
    const getPage = vi.fn((_id: string, page: number) =>
      Promise.resolve({ page, totalPages: 10, text: `第 ${page} 页` })
    )
    installBridge(getPage)

    render(<ReadingWindow textbookId="tb_1" title="PDF 教材" initialPage={4} />)

    const toggle = await screen.findByRole('button', { name: /第 4 \/ 10 页/ })
    await user.click(toggle)
    expect(await screen.findByText('第 4 页')).toBeInTheDocument()
  })

  it('surfaces a read failure instead of hiding it', async () => {
    installBridge(() => Promise.reject(new Error('pages.json 损坏')))
    render(<ReadingWindow textbookId="tb_1" title="PDF 教材" initialPage={1} />)

    expect(await screen.findByRole('alert')).toHaveTextContent('pages.json 损坏')
  })
})
