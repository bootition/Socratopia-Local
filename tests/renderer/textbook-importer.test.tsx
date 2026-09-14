/**
 * Textbook import UI tests (Milestone 3, Task 9).
 *
 * Covers:
 *  - Paste flow requires a non-empty title and content.
 *  - Pasted Markdown is saved via `textbooks.createFromText({ title, format: 'markdown', content })`.
 *  - `.txt` uploads are read with the browser FileReader and saved as `format: 'text'`.
 *  - Unsupported extensions show an error and never reach the API.
 *  - The saved textbook id is written back to ClassroomContext.
 *  - The user can preview the saved textbook and return to the form to import another.
 *
 * The importer uses `useClassroom()`, so every render is wrapped in ClassroomProvider.
 */

import React from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

import { TextbookImporter } from '../../src/renderer/src/textbooks/TextbookImporter'
import {
  ClassroomProvider,
  useClassroom
} from '../../src/renderer/src/context/ClassroomContext'
import type { SocratopiaAPI } from '../../src/preload'
import type { Textbook } from '../../src/shared/schemas/textbook'
import type { TextbookId, WorldId } from '../../src/shared/types/ids'

interface CreateFromTextInput {
  title: string
  format: 'markdown' | 'text'
  content: string
}

const SAVED_TEXTBOOK: Textbook = {
  id: 'tb-1' as TextbookId,
  worldId: 'world_default' as WorldId,
  title: 'Placeholder title',
  format: 'markdown',
  sourceFile: 'source.md',
  originalFile: null,
  progress: { currentPage: 0, totalPages: null },
  createdAt: '2026-07-07T00:00:00.000Z',
  updatedAt: '2026-07-07T00:00:00.000Z',
  content: 'Placeholder content'
}

let createFromTextMock: Mock<(input: CreateFromTextInput) => Promise<Textbook>>
let importFileMock: Mock<() => Promise<Textbook | null>>

function notImplemented(): Promise<never> {
  return Promise.reject(new Error('Not implemented in textbook importer test'))
}

beforeEach(() => {
  createFromTextMock = vi.fn<(input: CreateFromTextInput) => Promise<Textbook>>()
  // Echo the input back so the preview reflects what was imported.
  createFromTextMock.mockImplementation(async (input) => ({ ...SAVED_TEXTBOOK, ...input }))
  importFileMock = vi.fn<() => Promise<Textbook | null>>()
  importFileMock.mockResolvedValue({ ...SAVED_TEXTBOOK, format: 'pdf' })

  const mockSocratopia = {
    getVersion: async () => '0.1.0',
    getPlatform: async () => 'win32',
    settings: {
      hasDeepSeekKey: async () => false,
      setDeepSeekKey: async () => undefined,
      deleteDeepSeekKey: async () => undefined
    },
    chat: {
      startStream: notImplemented,
      cancelStream: async () => undefined,
      onToken: () => () => undefined,
      onError: () => () => undefined,
      onEnd: () => () => undefined,
      onUsage: () => () => undefined
    },
    companions: {
      list: async () => [],
      get: notImplemented
    },
    textbooks: {
      createFromText: createFromTextMock,
      list: async () => [],
      get: notImplemented,
      delete: notImplemented,
      importFile: importFileMock
    },
    conversations: {
      create: notImplemented,
      list: async () => [],
      get: notImplemented
    },
    messages: {
      append: notImplemented,
      list: async () => []
    }
  } as unknown as SocratopiaAPI

  Object.defineProperty(window, 'socratopia', {
    configurable: true,
    value: mockSocratopia
  })
})

afterEach(() => {
  cleanup()
  Reflect.deleteProperty(window, 'socratopia')
})

function SelectedTextbookId(): React.ReactElement {
  const { textbookId } = useClassroom()
  return <span data-testid="selected-textbook-id">{textbookId ?? 'none'}</span>
}

function renderImporter(): void {
  render(
    <ClassroomProvider>
      <TextbookImporter />
      <SelectedTextbookId />
    </ClassroomProvider>
  )
}

async function fillPastedTextbook(
  user: ReturnType<typeof userEvent.setup>,
  title = 'Intro to Logic',
  content = 'Logic is fun.'
): Promise<void> {
  await user.type(screen.getByLabelText(/textbook title/i), title)
  await user.type(screen.getByLabelText(/^content$/i), content)
}

describe('TextbookImporter', () => {
  it('requires a title and content before a pasted textbook can be saved', async () => {
    const user = userEvent.setup()
    renderImporter()

    await user.click(screen.getByRole('button', { name: /save textbook/i }))

    const alertText = screen
      .getAllByRole('alert')
      .map((node) => node.textContent ?? '')
      .join(' | ')
    expect(alertText).toMatch(/title is required/i)
    expect(alertText).toMatch(/content is required/i)
    expect(createFromTextMock).not.toHaveBeenCalled()
  })

  it('saves pasted Markdown by calling textbooks.createFromText', async () => {
    const user = userEvent.setup()
    renderImporter()

    await fillPastedTextbook(user, 'Intro to Logic', '# Lesson 1\n\nLogic is fun.')
    await user.click(screen.getByRole('button', { name: /save textbook/i }))

    await waitFor(() => expect(createFromTextMock).toHaveBeenCalledTimes(1))
    expect(createFromTextMock).toHaveBeenCalledWith({
      title: 'Intro to Logic',
      format: 'markdown',
      content: '# Lesson 1\n\nLogic is fun.'
    })
  })

  it('reads a .txt upload with FileReader and saves it as plain text', async () => {
    const user = userEvent.setup()
    renderImporter()

    const file = new File(['Chapter one: the basics'], 'Notes.txt', { type: 'text/plain' })
    await user.upload(screen.getByLabelText(/upload/i), file)

    // FileReader is asynchronous: wait for the decoded text to reach the form.
    await waitFor(() =>
      expect(screen.getByLabelText(/^content$/i)).toHaveValue('Chapter one: the basics')
    )
    // Title is derived from the file name when the user has not typed one.
    expect(screen.getByLabelText(/textbook title/i)).toHaveValue('Notes')

    await user.click(screen.getByRole('button', { name: /save textbook/i }))

    await waitFor(() => expect(createFromTextMock).toHaveBeenCalledTimes(1))
    // Exact object match also proves no local filesystem path is sent to main.
    expect(createFromTextMock).toHaveBeenCalledWith({
      title: 'Notes',
      format: 'text',
      content: 'Chapter one: the basics'
    })
  })

  it('shows an error for unsupported extensions and never calls the API', async () => {
    // user-event filters uploads through the input's accept attribute by default;
    // disable that here so the component's own extension check is exercised.
    const user = userEvent.setup({ applyAccept: false })
    renderImporter()

    const file = new File(['%PDF-1.4'], 'chapter.pdf', { type: 'application/pdf' })
    await user.upload(screen.getByLabelText(/upload/i), file)

    expect(await screen.findByRole('alert')).toHaveTextContent(/unsupported file type/i)
    expect(screen.getByLabelText(/^content$/i)).toHaveValue('')
    expect(createFromTextMock).not.toHaveBeenCalled()
  })

  it('limits file selection to .md and .txt via the accept attribute', () => {
    renderImporter()

    expect(screen.getByLabelText(/upload/i)).toHaveAttribute(
      'accept',
      '.md,.txt,text/markdown,text/plain'
    )
  })

  it('writes the saved textbook id to ClassroomContext and previews the content', async () => {
    const user = userEvent.setup()
    renderImporter()

    await fillPastedTextbook(user)
    await user.click(screen.getByRole('button', { name: /save textbook/i }))

    await waitFor(() =>
      expect(screen.getByTestId('selected-textbook-id')).toHaveTextContent('tb-1')
    )
    expect(screen.getByRole('heading', { name: 'Intro to Logic' })).toBeInTheDocument()
    expect(screen.getByText('Logic is fun.')).toBeInTheDocument()
  })

  it('returns to an empty form when the user imports another textbook', async () => {
    const user = userEvent.setup()
    renderImporter()

    await fillPastedTextbook(user)
    await user.click(screen.getByRole('button', { name: /save textbook/i }))
    await screen.findByRole('heading', { name: 'Intro to Logic' })

    await user.click(screen.getByRole('button', { name: /import another textbook/i }))

    expect(screen.getByLabelText(/textbook title/i)).toHaveValue('')
    expect(screen.getByLabelText(/^content$/i)).toHaveValue('')
    expect(screen.getByRole('button', { name: /save textbook/i })).toBeInTheDocument()
  })

  it('shows the save error and keeps the form when the API rejects', async () => {
    createFromTextMock.mockRejectedValueOnce(new Error('Disk full'))
    const user = userEvent.setup()
    renderImporter()

    await fillPastedTextbook(user)
    await user.click(screen.getByRole('button', { name: /save textbook/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/disk full/i)
    expect(screen.getByTestId('selected-textbook-id')).toHaveTextContent('none')
    expect(screen.getByRole('button', { name: /save textbook/i })).toBeInTheDocument()
  })
})

describe('TextbookImporter — native file import', () => {
  it('imports a PDF through the main-process dialog', async () => {
    const user = userEvent.setup()
    renderImporter()

    await user.click(
      await screen.findByRole('button', { name: '选择文件导入…' })
    )

    await waitFor(() => {
      expect(importFileMock).toHaveBeenCalledTimes(1)
    })
    expect(await screen.findByText('Placeholder title')).toBeInTheDocument()
    expect(screen.getByText('PDF')).toBeInTheDocument()
  })

  it('stays on the form when the dialog is cancelled', async () => {
    const user = userEvent.setup()
    importFileMock.mockResolvedValue(null)
    renderImporter()

    await user.click(
      await screen.findByRole('button', { name: '选择文件导入…' })
    )

    await waitFor(() => {
      expect(importFileMock).toHaveBeenCalled()
    })
    expect(screen.getByRole('button', { name: 'Save textbook' })).toBeInTheDocument()
  })

  it('shows an error when parsing fails', async () => {
    const user = userEvent.setup()
    importFileMock.mockRejectedValue(new Error('PDF 中没有可提取的文字'))
    renderImporter()

    await user.click(
      await screen.findByRole('button', { name: '选择文件导入…' })
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not import that file'
    )
    expect(screen.getByRole('alert')).toHaveTextContent('PDF 中没有可提取的文字')
  })
})
