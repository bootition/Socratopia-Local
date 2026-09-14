/**
 * Tests for the classroom chat primitives: ChatInput and MessageList.
 */
import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

import { ChatInput } from '../../src/renderer/src/chat/ChatInput'
import { MessageList } from '../../src/renderer/src/chat/MessageList'

afterEach(cleanup)

// ---------------------------------------------------------------
// ChatInput
// ---------------------------------------------------------------

describe('ChatInput', () => {
  it('sends non-empty input on Enter and clears the composer', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn()
    render(<ChatInput onSend={onSend} />)

    const textarea = screen.getByLabelText('Message')
    await user.type(textarea, '什么是惯性？{Enter}')

    expect(onSend).toHaveBeenCalledWith('什么是惯性？')
    expect(textarea).toHaveValue('')
  })

  it('inserts a newline on Shift+Enter instead of sending', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn()
    render(<ChatInput onSend={onSend} />)

    await user.type(screen.getByLabelText('Message'), '第一行{Shift>}{Enter}{/Shift}第二行')

    expect(onSend).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Message')).toHaveValue('第一行\n第二行')
  })

  it('keeps the send button disabled for whitespace-only input', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn()
    render(<ChatInput onSend={onSend} />)

    const sendButton = screen.getByRole('button', { name: '发送' })
    expect(sendButton).toBeDisabled()

    await user.type(screen.getByLabelText('Message'), '   ')
    expect(sendButton).toBeDisabled()

    await user.click(sendButton)
    expect(onSend).not.toHaveBeenCalled()
  })

  it('shows the cancel control only while streaming', () => {
    const { rerender } = render(
      <ChatInput onSend={vi.fn()} onCancel={vi.fn()} isStreaming={false} />
    )
    expect(screen.queryByRole('button', { name: '停止' })).toBeNull()

    rerender(<ChatInput onSend={vi.fn()} onCancel={vi.fn()} isStreaming />)
    expect(screen.getByRole('button', { name: '停止' })).toBeInTheDocument()
  })

  it('does not send while an IME composition is active', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn()
    render(<ChatInput onSend={onSend} />)

    const textarea = screen.getByLabelText('Message')
    await user.type(textarea, '惯性')
    // Simulate the Enter that confirms an IME candidate list.
    const composingEvent = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true
    })
    Object.defineProperty(composingEvent, 'isComposing', { value: true })
    textarea.dispatchEvent(composingEvent)

    expect(onSend).not.toHaveBeenCalled()
  })

  it('supports Ctrl+Enter sending when Enter inserts newlines', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn()
    render(<ChatInput onSend={onSend} sendOnEnter={false} />)

    const textarea = screen.getByLabelText('Message')
    await user.type(textarea, '第一行{Enter}第二行')
    expect(onSend).not.toHaveBeenCalled()

    await user.type(textarea, '{Control>}{Enter}{/Control}')
    expect(onSend).toHaveBeenCalledWith('第一行\n第二行')
  })
})

// ---------------------------------------------------------------
// MessageList
// ---------------------------------------------------------------

describe('MessageList', () => {
  it('renders assistant content through the Markdown renderer', () => {
    render(
      <MessageList
        messages={[
          {
            id: 'msg_1',
            role: 'assistant',
            content: '**关键概念**\n\n请想一想：为什么？'
          }
        ]}
      />
    )

    expect(screen.getByText('关键概念')).toBeInTheDocument()
    // Streamdown renders **bold** as a dedicated strong node
    expect(
      screen.getByText('关键概念').closest('[data-streamdown="strong"]')
    ).not.toBeNull()
  })

  it('renders user text verbatim and system notes as muted lines', () => {
    render(
      <MessageList
        messages={[
          { id: 'msg_1', role: 'user', content: '我的**想法**' },
          { id: 'msg_2', role: 'system', content: '课堂已开始' }
        ]}
      />
    )

    expect(screen.getByText('我的**想法**')).toBeInTheDocument()
    expect(screen.getByText('课堂已开始')).toBeInTheDocument()
  })

  it('shows the streaming draft only while streaming', () => {
    const { rerender } = render(
      <MessageList messages={[]} streamingContent="思考片段" isStreaming />
    )
    expect(screen.getByText('思考片段')).toBeInTheDocument()

    rerender(
      <MessageList
        messages={[{ id: 'msg_1', role: 'assistant', content: '最终回复' }]}
        streamingContent="思考片段"
        isStreaming={false}
      />
    )
    expect(screen.queryByText('思考片段')).toBeNull()
    expect(screen.getByText('最终回复')).toBeInTheDocument()
  })

  it('exposes the transcript as a polite log region', () => {
    render(<MessageList messages={[]} />)
    const log = screen.getByRole('log', { name: '课堂消息' })
    expect(log).toHaveAttribute('aria-live', 'polite')
  })

  it('appends externally inserted text to the draft', () => {
    const onInsertConsumed = vi.fn()
    const { rerender } = render(<ChatInput onSend={vi.fn()} insertText={null} />)

    rerender(
      <ChatInput
        onSend={vi.fn()}
        insertText="= 42"
        onInsertConsumed={onInsertConsumed}
      />
    )

    expect(screen.getByLabelText('Message')).toHaveValue('= 42')
    expect(onInsertConsumed).toHaveBeenCalled()
  })
})

describe('MessageList editing', () => {
  it('saves an edited message through onEditMessage', async () => {
    const user = userEvent.setup()
    const onEditMessage = vi.fn().mockResolvedValue(undefined)
    render(
      <MessageList
        messages={[{ id: 'msg_1', role: 'user', content: '旧内容' }]}
        onEditMessage={onEditMessage}
      />
    )

    await user.click(screen.getByRole('button', { name: '编辑' }))
    const editor = screen.getByLabelText('编辑消息')
    await user.clear(editor)
    await user.type(editor, '新内容')
    await user.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => {
      expect(onEditMessage).toHaveBeenCalledWith('msg_1', '新内容')
    })
    // The presentational component closes the editor; the parent
    // (useConversation) is responsible for updating the stored message.
    expect(screen.queryByLabelText('编辑消息')).toBeNull()
    expect(screen.getByText('旧内容')).toBeInTheDocument()
  })

  it('cancels without saving and shows save errors', async () => {
    const user = userEvent.setup()
    const onEditMessage = vi.fn().mockRejectedValue(new Error('保存失败'))
    render(
      <MessageList
        messages={[{ id: 'msg_2', role: 'assistant', content: '原始回复' }]}
        onEditMessage={onEditMessage}
      />
    )

    await user.click(screen.getByRole('button', { name: '编辑' }))
    await user.click(screen.getByRole('button', { name: '取消' }))
    expect(onEditMessage).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: '编辑' }))
    await user.click(screen.getByRole('button', { name: '保存' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('保存失败')
    expect(screen.getByLabelText('编辑消息')).toBeInTheDocument()
  })
})

describe('MessageList notes', () => {
  it('creates a note with the chosen text and colour', async () => {
    const user = userEvent.setup()
    const onCreateNote = vi.fn().mockResolvedValue(undefined)
    render(
      <MessageList
        messages={[{ id: 'msg_1', role: 'assistant', content: '惯性是……' }]}
        onCreateNote={onCreateNote}
      />
    )

    await user.click(screen.getByRole('button', { name: '记笔记' }))
    await user.type(screen.getByLabelText('笔记内容'), '我没听懂这一段')
    await user.selectOptions(screen.getByLabelText('笔记颜色'), 'blue')
    await user.click(screen.getByRole('button', { name: '保存笔记' }))

    await waitFor(() => {
      expect(onCreateNote).toHaveBeenCalledWith('msg_1', '我没听懂这一段', 'blue')
    })
  })

  it('renders existing notes next to the message', () => {
    render(
      <MessageList
        messages={[{ id: 'msg_1', role: 'assistant', content: '惯性是……' }]}
        notesByMessage={{
          msg_1: [
            {
              id: 'note_1',
              conversationId: 'conv_1',
              messageId: 'msg_1',
              kind: 'note',
              text: '我的笔记',
              quote: '',
              color: 'green',
              createdAt: '2026-09-14T09:00:00.000Z',
              updatedAt: '2026-09-14T09:00:00.000Z'
            }
          ]
        }}
      />
    )
    expect(screen.getByText('我的笔记')).toBeInTheDocument()
  })
})

describe('MessageList selection toolbar', () => {
  it('offers actions for the selected message text', async () => {
    const user = userEvent.setup()
    const onSelectionAction = vi.fn()
    render(
      <MessageList
        messages={[
          { id: 'msg_1', role: 'assistant', content: '惯性是物体保持静止的性质。' }
        ]}
        onSelectionAction={onSelectionAction}
      />
    )

    const textElement = screen.getByText('惯性是物体保持静止的性质。')
    const range = document.createRange()
    range.selectNodeContents(textElement)
    const selection = window.getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)

    fireEvent.mouseUp(textElement)

    await user.click(await screen.findByRole('button', { name: '解释' }))
    expect(onSelectionAction).toHaveBeenCalledWith(
      'explain',
      '惯性是物体保持静止的性质。'
    )
  })

  it('hides the toolbar when the selection is empty', () => {
    render(
      <MessageList
        messages={[{ id: 'msg_1', role: 'assistant', content: '内容' }]}
        onSelectionAction={vi.fn()}
      />
    )
    window.getSelection()?.removeAllRanges()
    fireEvent.mouseUp(screen.getByRole('log'))
    expect(screen.queryByRole('toolbar')).toBeNull()
  })
})

describe('ChatInput streaming behaviour', () => {
  it('keeps the draft instead of sending while the companion replies', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn()
    render(<ChatInput onSend={onSend} isStreaming />)

    await user.type(screen.getByLabelText('Message'), '第二个问题{Enter}')

    expect(onSend).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Message')).toHaveValue('第二个问题')
    expect(screen.getByRole('button', { name: '发送' })).toBeDisabled()
    expect(
      screen.getByText('同伴正在回复，可先输入，结束后再发送')
    ).toBeInTheDocument()
  })
})
