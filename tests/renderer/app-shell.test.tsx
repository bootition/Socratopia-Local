/**
 * App shell and ClassroomContext tests.
 *
 * Covers:
 *  - Sidebar rendering (title, sections)
 *  - ClassroomContext provider + hook (state, setters)
 *  - AppShell <main> landmark
 *  - App renders shell instead of splash
 */

import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { Sidebar } from '../../src/renderer/src/app-shell/Sidebar'
import { AppShell } from '../../src/renderer/src/app-shell/AppShell'
import { ClassroomProvider, useClassroom } from '../../src/renderer/src/context/ClassroomContext'
import App from '../../src/renderer/src/App'
import type { SocratopiaAPI } from '../../src/preload'
import { DEFAULT_PREFERENCES } from '../../src/shared/schemas/preferences'

afterEach(cleanup)

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

describe('Sidebar', () => {
  it('renders app title', () => {
    render(<Sidebar />)
    expect(screen.getByText('Socratopia')).toBeInTheDocument()
  })

  it('renders section labels: Settings, Companion, Textbook, Classroom', () => {
    render(<Sidebar />)

    expect(screen.getByText('Settings')).toBeInTheDocument()
    expect(screen.getByText('Companion')).toBeInTheDocument()
    expect(screen.getByText('Textbook')).toBeInTheDocument()
    expect(screen.getByText('Classroom')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// ClassroomContext
// ---------------------------------------------------------------------------

describe('ClassroomContext', () => {
  function ContextConsumer(): React.ReactElement {
    const ctx = useClassroom()
    return (
      <div>
        <span data-testid="companionId">{ctx.companionId ?? 'null'}</span>
        <span data-testid="textbookId">{ctx.textbookId ?? 'null'}</span>
        <span data-testid="conversationId">{ctx.conversationId ?? 'null'}</span>
        <button
          data-testid="set-companion"
          onClick={() => ctx.setCompanionId('comp-1')}
        >
          Set Companion
        </button>
        <button
          data-testid="set-textbook"
          onClick={() => ctx.setTextbookId('tb-1')}
        >
          Set Textbook
        </button>
        <button
          data-testid="set-conversation"
          onClick={() => ctx.setConversationId('conv-1')}
        >
          Set Conversation
        </button>
      </div>
    )
  }

  it('exposes setCompanionId, setTextbookId, and setConversationId as updaters', async () => {
    const user = userEvent.setup()

    render(
      <ClassroomProvider>
        <ContextConsumer />
      </ClassroomProvider>
    )

    // Initial state is null
    expect(screen.getByTestId('companionId').textContent).toBe('null')
    expect(screen.getByTestId('textbookId').textContent).toBe('null')
    expect(screen.getByTestId('conversationId').textContent).toBe('null')

    // Update each
    await user.click(screen.getByTestId('set-companion'))
    expect(screen.getByTestId('companionId').textContent).toBe('comp-1')

    await user.click(screen.getByTestId('set-textbook'))
    expect(screen.getByTestId('textbookId').textContent).toBe('tb-1')

    await user.click(screen.getByTestId('set-conversation'))
    expect(screen.getByTestId('conversationId').textContent).toBe('conv-1')
  })

  it('throws when useClassroom is used outside ClassroomProvider', () => {
    // Suppress console.error for expected error boundary output
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => render(<ContextConsumer />)).toThrow(
      /useClassroom must be used within a ClassroomProvider/i
    )

    spy.mockRestore()
  })
})

// ---------------------------------------------------------------------------
// AppShell
// ---------------------------------------------------------------------------

describe('AppShell', () => {
  it('renders the Sidebar', () => {
    render(
      <ClassroomProvider>
        <AppShell />
      </ClassroomProvider>
    )

    expect(screen.getByText('Socratopia')).toBeInTheDocument()
  })

  it('renders accessible <main> landmark', () => {
    render(
      <ClassroomProvider>
        <AppShell />
      </ClassroomProvider>
    )

    const main = screen.getByRole('main')
    expect(main).toBeInTheDocument()
  })

  it('renders children inside the main region', () => {
    render(
      <ClassroomProvider>
        <AppShell>
          <p data-testid="child-content">Hello classroom</p>
        </AppShell>
      </ClassroomProvider>
    )

    const main = screen.getByRole('main')
    expect(main).toContainElement(screen.getByTestId('child-content'))
  })
})

// ---------------------------------------------------------------------------
// App renders shell
// ---------------------------------------------------------------------------

describe('App renders shell', () => {
  function notImplemented(): Promise<never> {