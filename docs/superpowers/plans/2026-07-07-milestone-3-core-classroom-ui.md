# Milestone 3 Core Classroom UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the first complete classroom loop: first-run API-key gate → companion selection → Markdown/text textbook context → streaming classroom chat → local conversation persistence → restart restore.

**Architecture:** Keep all filesystem, DeepSeek API-key, and persistence operations in Electron main process behind typed preload APIs. Renderer remains a pure React/Tailwind app using only `window.socratopia`, with state split into small feature components and a classroom context. Markdown rendering uses secure defaults: prefer `streamdown` for assistant content; do not render raw HTML from user/assistant messages.

**Tech Stack:** Electron, React 19, Tailwind CSS v4, TypeScript, Vitest, Zod, DeepSeek streaming IPC from Milestone 2, `streamdown`/KaTeX for secure Markdown/math/code rendering, Testing Library + jsdom for renderer component tests.

---

## Source of Truth

Milestone 3 scope is `docs/产品设计/实施计划.md` Tasks 9-12 and Checkpoint C:

- Task 9: Settings and first-run UI.
- Task 10: Companion selector for all 9 reference companions.
- Task 11: Markdown/text textbook import and selection.
- Task 12: Streaming classroom chat UI with Markdown/KaTeX/code rendering and local conversation persistence.
- Checkpoint C: `设置 Key → 选角色 → 选教材 → 发消息 → 流式回复 → 本地保存` works and conversation restores after restart.

## Non-Goals

- No PDF/EPUB import in this milestone.
- No lesson artifacts, summaries, flashcards, diary, or progress generation.
- No cloud sync, accounts, subscriptions, marketplace, or multi-user features.
- No renderer access to Node, `fs`, Electron, or raw `ipcRenderer`.
- No raw HTML rendering for assistant/user Markdown.

## Key Decisions

1. **Markdown renderer:** Use `streamdown` as the primary implementation path.
   - Verified packages: `streamdown@2.5.0`, `@streamdown/code@1.1.1`, `@streamdown/math@1.0.2`, `rehype-harden@1.1.8`, `katex@0.17.0`.
   - Rationale: built for AI streaming Markdown; reduces manual plugin wiring; supports math/code; safer default posture than `rehype-raw`.
2. **No `rehype-raw` by default:** If a later implementation uses `react-markdown`, it must not enable `rehype-raw` unless followed by `rehype-sanitize` and URL hardening. This milestone should not need raw HTML.
3. **Renderer tests:** Add `jsdom`, `@testing-library/react`, and `@testing-library/jest-dom` so UI behavior is testable without launching Electron.
4. **Message persistence:** Store conversation metadata separately from messages. Use JSONL for messages to avoid rewriting large arrays on each append.
5. **Commit style:** Existing repo uses plain English commit messages, e.g. `Add renderer chat stream controller`. Continue that style.

---

## File Structure

Create or modify these files during Milestone 3:

```text
src/
├── main/
│   ├── index.ts                              # Register new IPC handlers
│   ├── ipc/
│   │   ├── companions.ts                     # New companion list/get handlers
│   │   ├── textbooks.ts                      # New textbook create/import/list handlers
│   │   └── conversations.ts                  # New conversation/message handlers
│   ├── textbooks/
│   │   └── textbook-store.ts                 # New appData textbook persistence
│   └── conversations/
│       ├── conversation-store.ts             # New conversation metadata persistence
│       └── message-store.ts                  # New JSONL message persistence
├── preload/
│   ├── index.ts                              # Add companions/textbooks/conversations APIs
│   └── index.d.ts                            # Add typed Window bridge declarations
├── shared/
│   ├── channel-names.ts                      # Add IPC channel constants
│   └── schemas/
│       └── ipc.ts                            # Add IPC schemas for new APIs
└── renderer/src/
    ├── App.tsx                               # Replace splash with app shell
    ├── main.tsx                              # Import KaTeX/CSS if required by renderer package
    ├── app-shell/
    │   ├── AppShell.tsx
    │   └── Sidebar.tsx
    ├── context/
    │   └── ClassroomContext.tsx
    ├── settings/
    │   └── SettingsGate.tsx
    ├── companions/
    │   ├── CompanionSelector.tsx
    │   └── CompanionCard.tsx
    ├── textbooks/
    │   ├── TextbookImporter.tsx
    │   └── TextbookPreview.tsx
    └── chat/
        ├── MarkdownRenderer.tsx
        ├── ChatInput.tsx
        ├── MessageList.tsx
        ├── ChatPanel.tsx
        └── useConversation.ts

tests/
├── main/
│   ├── ipc/
│   │   ├── companions.test.ts
│   │   ├── textbooks.test.ts
│   │   └── conversations.test.ts
│   ├── textbooks/textbook-store.test.ts
│   └── conversations/
│       ├── conversation-store.test.ts
│       └── message-store.test.ts
└── renderer/
    ├── markdown-renderer.test.tsx
    ├── settings-gate.test.tsx
    ├── companion-selector.test.tsx
    ├── textbook-importer.test.tsx
    └── chat-panel.test.tsx
```

---

## Task 1: Renderer Test Harness and Markdown Dependencies

**Description:** Add only the dependencies required to test renderer components and safely render assistant Markdown with math and code.

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `vitest.config.ts`
- Modify: `src/renderer/src/main.tsx`

- [ ] **Step 1: Install dependencies**

Run:

```powershell
npm install streamdown @streamdown/code @streamdown/math rehype-harden katex
npm install -D jsdom @testing-library/react @testing-library/jest-dom
```

Expected: `package.json` and `package-lock.json` update; no install errors.

- [ ] **Step 2: Add renderer test environment configuration**

Modify `vitest.config.ts` so existing `.test.ts` node tests keep working and `.test.tsx` renderer tests run under jsdom:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    globals: false,
    environmentMatchGlobs: [
      ['tests/renderer/**/*.test.tsx', 'jsdom']
    ],
    setupFiles: ['tests/renderer/setup.ts']
  }
})
```

Create `tests/renderer/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest'
```

- [ ] **Step 3: Import required CSS in renderer entry**

Modify `src/renderer/src/main.tsx`:

```ts
import React from 'react'
import ReactDOM from 'react-dom/client'
import 'katex/dist/katex.min.css'
import App from './App'
import './assets/main.css'
```

- [ ] **Step 4: Verify**

Run:

```powershell
npm run typecheck
npm test
npm run build
```

Expected: all pass.

- [ ] **Step 5: Commit**

```powershell
$env:GIT_MASTER='1'; git add package.json package-lock.json vitest.config.ts tests/renderer/setup.ts src/renderer/src/main.tsx
$env:GIT_MASTER='1'; git commit -m "Add renderer test and markdown dependencies" -m "Ultraworked with [Sisyphus](https://github.com/code-yeongyu/oh-my-openagent)" -m "Co-authored-by: Sisyphus <clio-agent@sisyphuslabs.ai>"
```

---

## Task 2: Companion Read IPC

**Description:** Expose the initialized 9 reference companions to renderer through a typed preload API.

**Files:**
- Create: `src/main/ipc/companions.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/preload/index.d.ts`
- Modify: `src/shared/channel-names.ts`
- Modify: `src/shared/schemas/ipc.ts`
- Modify: `src/main/index.ts`
- Test: `tests/main/ipc/companions.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/main/ipc/companions.test.ts` with these behaviors:

```ts
import { describe, expect, it } from 'vitest'
import { readCompanionIndex, readCompanionMarkdown } from '../../../src/main/ipc/companions'

describe('companion read helpers', () => {
  it('reads all companions from index.json', async () => {
    const companions = await readCompanionIndex('tests/fixtures/companions')
    expect(companions).toHaveLength(9)
    expect(companions.map(c => c.name)).toContain('Alice')
  })

  it('rejects unknown companion ids before reading markdown', async () => {
    await expect(readCompanionMarkdown('tests/fixtures/companions', '../escape'))
      .rejects.toThrow('Invalid companion id')
  })
})
```

Use fixture setup in the test to create a temp companion directory and `index.json`; do not depend on user appData.

- [ ] **Step 2: Verify RED**

Run:

```powershell
npx vitest run tests/main/ipc/companions.test.ts
```

Expected: FAIL because `src/main/ipc/companions.ts` does not exist.

- [ ] **Step 3: Implement companion IPC**

Implement:

```ts
export async function readCompanionIndex(companionDir: string): Promise<Companion[]>
export async function readCompanionMarkdown(companionDir: string, companionId: string): Promise<string>
export function registerCompanionIpc(options: { companionDir: string }): void
```

Requirements:
- Validate parsed companions with `CompanionSchema`.
- Reject companion ids that contain `/`, `\\`, `.`, or path separators.
- Renderer receives companion metadata and markdown only, never filesystem paths outside allowed filenames.
- Register `companions:list` and `companions:get` channels.

- [ ] **Step 4: Extend preload bridge**

Add:

```ts
export interface CompanionsAPI {
  list: () => Promise<Companion[]>
  get: (companionId: string) => Promise<{ companion: Companion; markdown: string }>
}
```

Add `companions: CompanionsAPI` to `SocratopiaAPI`.

- [ ] **Step 5: Verify GREEN**

Run:

```powershell
npx vitest run tests/main/ipc/companions.test.ts
npm run typecheck
npm run test:security
```

Expected: all pass; security script still confirms renderer has no raw IPC access.

- [ ] **Step 6: Commit**

```powershell
$env:GIT_MASTER='1'; git add src/main/ipc/companions.ts src/preload/index.ts src/preload/index.d.ts src/shared/channel-names.ts src/shared/schemas/ipc.ts src/main/index.ts tests/main/ipc/companions.test.ts
$env:GIT_MASTER='1'; git commit -m "Add companion read IPC" -m "Ultraworked with [Sisyphus](https://github.com/code-yeongyu/oh-my-openagent)" -m "Co-authored-by: Sisyphus <clio-agent@sisyphuslabs.ai>"
```

---

## Task 3: Textbook Store and IPC

**Description:** Support `.md`/`.txt` textbook creation from renderer-provided text and expose textbook list/selection to the classroom.

**Files:**
- Create: `src/main/textbooks/textbook-store.ts`
- Create: `src/main/ipc/textbooks.ts`
- Modify: `src/main/storage/app-data.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/preload/index.d.ts`
- Modify: `src/shared/channel-names.ts`
- Modify: `src/shared/schemas/ipc.ts`
- Modify: `src/main/index.ts`
- Test: `tests/main/textbooks/textbook-store.test.ts`
- Test: `tests/main/ipc/textbooks.test.ts`

- [ ] **Step 1: Write failing store tests**

Create `tests/main/textbooks/textbook-store.test.ts` with:

```ts
import { mkdtemp, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { createTextbookFromText, listTextbooks } from '../../../src/main/textbooks/textbook-store'

describe('textbook-store', () => {
  it('creates metadata and source.md from pasted markdown', async () => {
    const root = await mkdtemp(join(tmpdir(), 'socratopia-textbook-'))
    const textbook = await createTextbookFromText(root, {
      worldId: 'world_default',
      title: 'Newton Notes',
      format: 'markdown',
      content: '# Gravity\n\nForce and motion.'
    })
    expect(textbook.title).toBe('Newton Notes')
    expect(await readFile(join(root, textbook.id, 'source.md'), 'utf-8')).toContain('# Gravity')
  })

  it('lists textbooks sorted by updatedAt descending', async () => {
    const root = await mkdtemp(join(tmpdir(), 'socratopia-textbook-'))
    await createTextbookFromText(root, { worldId: 'world_default', title: 'A', format: 'text', content: 'A' })
    await createTextbookFromText(root, { worldId: 'world_default', title: 'B', format: 'text', content: 'B' })
    const textbooks = await listTextbooks(root)
    expect(textbooks[0].title).toBe('B')
  })
})
```

- [ ] **Step 2: Verify RED**

Run:

```powershell
npx vitest run tests/main/textbooks/textbook-store.test.ts
```

Expected: FAIL because store does not exist.

- [ ] **Step 3: Implement textbook store**

Implement functions:

```ts
export interface CreateTextbookFromTextInput {
  worldId: string
  title: string
  format: 'markdown' | 'text'
  content: string
}

export async function createTextbookFromText(rootDir: string, input: CreateTextbookFromTextInput): Promise<Textbook>
export async function listTextbooks(rootDir: string): Promise<Textbook[]>
export async function getTextbook(rootDir: string, textbookId: string): Promise<Textbook>
```

Requirements:
- Generate id as `tb_${timestamp}_${random}`.
- Write metadata to `textbook.json` and content to `source.md`.
- Validate metadata with `TextbookSchema`.
- Reject empty title/content before writing.
- Do not accept arbitrary renderer file paths; renderer sends text content, not paths.

- [ ] **Step 4: Implement IPC and preload APIs**

Expose:

```ts
export interface TextbooksAPI {
  createFromText: (input: { title: string; format: 'markdown' | 'text'; content: string }) => Promise<Textbook>
  list: () => Promise<Textbook[]>
  get: (textbookId: string) => Promise<Textbook>
}
```

- [ ] **Step 5: Verify GREEN**

Run:

```powershell
npx vitest run tests/main/textbooks/textbook-store.test.ts tests/main/ipc/textbooks.test.ts
npm run typecheck
npm run test:security
```

Expected: all pass.

- [ ] **Step 6: Commit**

```powershell
$env:GIT_MASTER='1'; git add src/main/textbooks/textbook-store.ts src/main/ipc/textbooks.ts src/main/storage/app-data.ts src/preload/index.ts src/preload/index.d.ts src/shared/channel-names.ts src/shared/schemas/ipc.ts src/main/index.ts tests/main/textbooks/textbook-store.test.ts tests/main/ipc/textbooks.test.ts
$env:GIT_MASTER='1'; git commit -m "Add textbook import IPC" -m "Ultraworked with [Sisyphus](https://github.com/code-yeongyu/oh-my-openagent)" -m "Co-authored-by: Sisyphus <clio-agent@sisyphuslabs.ai>"
```

---

## Task 4: Conversation and Message Persistence IPC

**Description:** Persist classroom conversations and messages locally so the latest classroom can restore after restart.

**Files:**
- Create: `src/main/conversations/conversation-store.ts`
- Create: `src/main/conversations/message-store.ts`
- Create: `src/main/ipc/conversations.ts`
- Modify: `src/main/storage/app-data.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/preload/index.d.ts`
- Modify: `src/shared/channel-names.ts`
- Modify: `src/shared/schemas/ipc.ts`
- Modify: `src/main/index.ts`
- Test: `tests/main/conversations/conversation-store.test.ts`
- Test: `tests/main/conversations/message-store.test.ts`
- Test: `tests/main/ipc/conversations.test.ts`

- [ ] **Step 1: Write failing persistence tests**

Create tests proving:
- `createConversation()` writes `conversation.json`.
- `appendMessage()` appends one JSONL line.
- `listMessages()` reads messages in insertion order.
- `listConversations()` sorts by `updatedAt` descending.
- Invalid IDs with path traversal are rejected.

Minimum test shape:

```ts
it('appends and reads messages in order', async () => {
  const root = await mkdtemp(join(tmpdir(), 'socratopia-conv-'))
  const conv = await createConversation(root, {
    worldId: 'world_default', companionId: 'comp_alice', textbookId: null, title: 'Alice lesson'
  })
  await appendMessage(root, conv.id, { role: 'user', content: 'Hello' })
  await appendMessage(root, conv.id, { role: 'assistant', content: 'Hi there' })
  const messages = await listMessages(root, conv.id)
  expect(messages.map(m => m.content)).toEqual(['Hello', 'Hi there'])
})
```

- [ ] **Step 2: Verify RED**

Run:

```powershell
npx vitest run tests/main/conversations/conversation-store.test.ts tests/main/conversations/message-store.test.ts
```

Expected: FAIL because stores do not exist.

- [ ] **Step 3: Implement stores**

Use this layout:

```text
conversations/
  conv_<id>/
    conversation.json
    messages.jsonl
```

Implement:

```ts
export async function createConversation(rootDir: string, input: CreateConversationInput): Promise<Conversation>
export async function listConversations(rootDir: string): Promise<Conversation[]>
export async function getConversation(rootDir: string, id: string): Promise<Conversation>
export async function appendMessage(rootDir: string, conversationId: string, input: AppendMessageInput): Promise<Message>
export async function listMessages(rootDir: string, conversationId: string): Promise<Message[]>
```

Requirements:
- Validate with `ConversationSchema` and `MessageSchema`.
- Store messages as newline-delimited JSON.
- Update conversation `updatedAt` after each append.
- Reject IDs containing path separators or dots.

- [ ] **Step 4: Implement IPC and preload APIs**

Expose:

```ts
export interface ConversationsAPI {
  create: (input: { companionId: string; textbookId: string | null; title: string }) => Promise<Conversation>
  list: () => Promise<Conversation[]>
  get: (conversationId: string) => Promise<Conversation>
}

export interface MessagesAPI {
  append: (input: { conversationId: string; role: 'user' | 'assistant' | 'system'; content: string }) => Promise<Message>
  list: (conversationId: string) => Promise<Message[]>
}
```

- [ ] **Step 5: Verify GREEN**

Run:

```powershell
npx vitest run tests/main/conversations tests/main/ipc/conversations.test.ts
npm run typecheck
npm run test:security
```

Expected: all pass.

- [ ] **Step 6: Commit**

```powershell
$env:GIT_MASTER='1'; git add src/main/conversations src/main/ipc/conversations.ts src/main/storage/app-data.ts src/preload/index.ts src/preload/index.d.ts src/shared/channel-names.ts src/shared/schemas/ipc.ts src/main/index.ts tests/main/conversations tests/main/ipc/conversations.test.ts
$env:GIT_MASTER='1'; git commit -m "Add conversation persistence IPC" -m "Ultraworked with [Sisyphus](https://github.com/code-yeongyu/oh-my-openagent)" -m "Co-authored-by: Sisyphus <clio-agent@sisyphuslabs.ai>"
```

---

## Checkpoint 1: Backend Classroom APIs

- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Run `npm audit --audit-level=high`.
- [ ] Confirm `npm run test:security` still reports no raw key or IPC exposure.
- [ ] Confirm renderer declarations expose only typed APIs under `window.socratopia`.

---

## Task 5: Secure Markdown Renderer

**Description:** Render assistant Markdown, math, and code blocks in the classroom without raw HTML execution.

**Files:**
- Create: `src/renderer/src/chat/MarkdownRenderer.tsx`
- Test: `tests/renderer/markdown-renderer.test.tsx`

- [ ] **Step 1: Write failing renderer tests**

Create `tests/renderer/markdown-renderer.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MarkdownRenderer } from '../../src/renderer/src/chat/MarkdownRenderer'

describe('MarkdownRenderer', () => {
  it('renders bold text and code blocks', () => {
    render(<MarkdownRenderer content={'**Key idea**\n\n```ts\nconst x: number = 1\n```'} />)
    expect(screen.getByText('Key idea')).toBeInTheDocument()
    expect(screen.getByText(/const x/)).toBeInTheDocument()
  })

  it('renders KaTeX math', () => {
    const { container } = render(<MarkdownRenderer content={'$E=mc^2$'} />)
    expect(container.querySelector('.katex')).not.toBeNull()
  })

  it('does not execute or preserve raw HTML event handlers', () => {
    const { container } = render(<MarkdownRenderer content={'<img src=x onerror="alert(1)">'} />)
    expect(container.querySelector('[onerror]')).toBeNull()
  })

  it('blocks javascript links', () => {
    render(<MarkdownRenderer content={'[bad](javascript:alert(1))'} />)
    const link = screen.queryByRole('link', { name: 'bad' })
    expect(link?.getAttribute('href')).not.toMatch(/^javascript:/)
  })
})
```

- [ ] **Step 2: Verify RED**

Run:

```powershell
npx vitest run tests/renderer/markdown-renderer.test.tsx
```

Expected: FAIL because component does not exist.

- [ ] **Step 3: Implement renderer**

Create `src/renderer/src/chat/MarkdownRenderer.tsx`:

```tsx
import { Streamdown } from 'streamdown'

export interface MarkdownRendererProps {
  content: string
}

export function MarkdownRenderer({ content }: MarkdownRendererProps): React.ReactElement {
  return (
    <div className="prose prose-invert max-w-none text-sm leading-7">
      <Streamdown>{content}</Streamdown>
    </div>
  )
}
```

If Streamdown link hardening requires explicit props, configure it so `javascript:`, `data:`, `file:`, and `vbscript:` links are blocked. Do not enable raw HTML rendering.

- [ ] **Step 4: Verify GREEN**

Run:

```powershell
npx vitest run tests/renderer/markdown-renderer.test.tsx
npm run typecheck:web
```

Expected: tests pass, no web type errors.

- [ ] **Step 5: Commit**

```powershell
$env:GIT_MASTER='1'; git add src/renderer/src/chat/MarkdownRenderer.tsx tests/renderer/markdown-renderer.test.tsx
$env:GIT_MASTER='1'; git commit -m "Add secure Markdown renderer" -m "Ultraworked with [Sisyphus](https://github.com/code-yeongyu/oh-my-openagent)" -m "Co-authored-by: Sisyphus <clio-agent@sisyphuslabs.ai>"
```

---

## Task 6: App Shell and Classroom Context

**Description:** Replace the splash screen with the structural classroom layout and shared state for selected companion/textbook/conversation.

**Files:**
- Create: `src/renderer/src/context/ClassroomContext.tsx`
- Create: `src/renderer/src/app-shell/AppShell.tsx`
- Create: `src/renderer/src/app-shell/Sidebar.tsx`
- Modify: `src/renderer/src/App.tsx`
- Test: `tests/renderer/app-shell.test.tsx`

- [ ] **Step 1: Write failing shell tests**

Test that:
- Sidebar renders app title and sections: Settings, Companion, Textbook, Classroom.
- Context provider exposes `setCompanionId`, `setTextbookId`, and `setConversationId`.
- Main content region has accessible landmark `main`.

- [ ] **Step 2: Verify RED**

Run:

```powershell
npx vitest run tests/renderer/app-shell.test.tsx
```

Expected: FAIL because shell components do not exist.

- [ ] **Step 3: Implement shell**

Design direction:
- Dark academic workspace, not purple-gradient AI UI.
- Left rail for state and navigation; right main pane for current workflow.
- Tailwind spacing scale only; no inline styles.
- `main` must fill remaining height and avoid page-level scroll trapping.

- [ ] **Step 4: Verify GREEN**

Run:

```powershell
npx vitest run tests/renderer/app-shell.test.tsx
npm run typecheck:web
```

Expected: pass.

- [ ] **Step 5: Commit**

```powershell
$env:GIT_MASTER='1'; git add src/renderer/src/context src/renderer/src/app-shell src/renderer/src/App.tsx tests/renderer/app-shell.test.tsx
$env:GIT_MASTER='1'; git commit -m "Add classroom app shell" -m "Ultraworked with [Sisyphus](https://github.com/code-yeongyu/oh-my-openagent)" -m "Co-authored-by: Sisyphus <clio-agent@sisyphuslabs.ai>"
```

---

## Task 7: First-Run Settings Gate

**Description:** Users without a DeepSeek key see a key setup screen. Users with a key enter the app shell. Deleting the key returns to the gate.

**Files:**
- Create: `src/renderer/src/settings/SettingsGate.tsx`
- Modify: `src/renderer/src/App.tsx`
- Test: `tests/renderer/settings-gate.test.tsx`

- [ ] **Step 1: Write failing tests**

Test with mocked `window.socratopia.settings`:
- `hasDeepSeekKey()` false renders password input and save button.
- Empty key shows validation text and does not call `setDeepSeekKey`.
- Saving non-empty key calls `setDeepSeekKey` and reveals children.
- Delete button calls `deleteDeepSeekKey` and returns to gate.

- [ ] **Step 2: Verify RED**

Run:

```powershell
npx vitest run tests/renderer/settings-gate.test.tsx
```

Expected: FAIL because component does not exist.

- [ ] **Step 3: Implement**

Requirements:
- Use `<input type="password" autoComplete="off">`.
- Label input with `htmlFor`.
- Keep plaintext key only in component state until save resolves.
- Clear local input state after save succeeds.

- [ ] **Step 4: Verify GREEN**

Run:

```powershell
npx vitest run tests/renderer/settings-gate.test.tsx
npm run test:security
```

Expected: pass; security script still confirms no key read API.

- [ ] **Step 5: Commit**

```powershell
$env:GIT_MASTER='1'; git add src/renderer/src/settings/SettingsGate.tsx src/renderer/src/App.tsx tests/renderer/settings-gate.test.tsx
$env:GIT_MASTER='1'; git commit -m "Add first-run settings gate" -m "Ultraworked with [Sisyphus](https://github.com/code-yeongyu/oh-my-openagent)" -m "Co-authored-by: Sisyphus <clio-agent@sisyphuslabs.ai>"
```

---

## Task 8: Companion Selector UI

**Description:** Show all 9 companions with name, identity, and personality summary; selecting a companion updates classroom state.

**Files:**
- Create: `src/renderer/src/companions/CompanionSelector.tsx`
- Create: `src/renderer/src/companions/CompanionCard.tsx`
- Test: `tests/renderer/companion-selector.test.tsx`

- [ ] **Step 1: Write failing tests**

Test that:
- Loading state renders while `companions.list()` is pending.
- All companion names render after list resolves.
- Clicking Alice marks Alice selected and calls `onSelect('comp_alice')`.
- Error state renders retry button after API rejection.

- [ ] **Step 2: Verify RED**

Run:

```powershell
npx vitest run tests/renderer/companion-selector.test.tsx
```

Expected: FAIL because components do not exist.

- [ ] **Step 3: Implement**

Requirements:
- Use `<button>` for cards so keyboard users can select companions.
- `aria-pressed` indicates selected state.
- Display name, identity, and first 2-3 personality keywords.
- Do not fetch companion markdown unless user opens a detail view; list uses metadata only.

- [ ] **Step 4: Verify GREEN**

Run:

```powershell
npx vitest run tests/renderer/companion-selector.test.tsx
npm run typecheck:web
```

Expected: pass.

- [ ] **Step 5: Commit**

```powershell
$env:GIT_MASTER='1'; git add src/renderer/src/companions tests/renderer/companion-selector.test.tsx
$env:GIT_MASTER='1'; git commit -m "Add companion selector UI" -m "Ultraworked with [Sisyphus](https://github.com/code-yeongyu/oh-my-openagent)" -m "Co-authored-by: Sisyphus <clio-agent@sisyphuslabs.ai>"
```

---

## Task 9: Textbook Import UI

**Description:** Users can paste Markdown/text or select a `.md`/`.txt` file; renderer reads file content with `FileReader` and sends text to main via preload.

**Files:**
- Create: `src/renderer/src/textbooks/TextbookImporter.tsx`
- Create: `src/renderer/src/textbooks/TextbookPreview.tsx`
- Test: `tests/renderer/textbook-importer.test.tsx`

- [ ] **Step 1: Write failing tests**

Test that:
- Paste flow requires title and content.
- Saving pasted Markdown calls `textbooks.createFromText({ title, format: 'markdown', content })`.
- `.txt` upload is read and saved with `format: 'text'`.
- Unsupported extension shows error text and does not call API.

- [ ] **Step 2: Verify RED**

Run:

```powershell
npx vitest run tests/renderer/textbook-importer.test.tsx
```

Expected: FAIL because component does not exist.

- [ ] **Step 3: Implement**

Requirements:
- File input accepts `.md,.txt,text/markdown,text/plain`.
- File content is read in renderer using browser `FileReader` only.
- Renderer never sends local filesystem paths to main.
- After save, selected textbook id is written to `ClassroomContext`.

- [ ] **Step 4: Verify GREEN**

Run:

```powershell
npx vitest run tests/renderer/textbook-importer.test.tsx
npm run typecheck:web
```

Expected: pass.

- [ ] **Step 5: Commit**

```powershell
$env:GIT_MASTER='1'; git add src/renderer/src/textbooks tests/renderer/textbook-importer.test.tsx
$env:GIT_MASTER='1'; git commit -m "Add textbook import UI" -m "Ultraworked with [Sisyphus](https://github.com/code-yeongyu/oh-my-openagent)" -m "Co-authored-by: Sisyphus <clio-agent@sisyphuslabs.ai>"
```

---

## Task 10: Chat Message Components

**Description:** Build accessible chat primitives: input, message list, user bubble, assistant bubble, streaming indicator, and cancel control.

**Files:**
- Create: `src/renderer/src/chat/ChatInput.tsx`
- Create: `src/renderer/src/chat/MessageList.tsx`
- Test: `tests/renderer/chat-components.test.tsx`

- [ ] **Step 1: Write failing tests**

Test that:
- Enter sends non-empty input.
- Shift+Enter inserts newline.
- Send button is disabled for whitespace input.
- Cancel button appears only while streaming.
- Message list renders assistant content through `MarkdownRenderer`.

- [ ] **Step 2: Verify RED**

Run:

```powershell
npx vitest run tests/renderer/chat-components.test.tsx
```

Expected: FAIL because components do not exist.

- [ ] **Step 3: Implement**

Accessibility requirements:
- Chat list uses `role="log"` and `aria-live="polite"` for streaming assistant updates.
- Input has visible label or `aria-label="Message"`.
- Send/cancel are real `<button>` elements.
- Focus returns to textarea after send.

- [ ] **Step 4: Verify GREEN**

Run:

```powershell
npx vitest run tests/renderer/chat-components.test.tsx
npm run typecheck:web
```

Expected: pass.

- [ ] **Step 5: Commit**

```powershell
$env:GIT_MASTER='1'; git add src/renderer/src/chat/ChatInput.tsx src/renderer/src/chat/MessageList.tsx tests/renderer/chat-components.test.tsx
$env:GIT_MASTER='1'; git commit -m "Add chat message components" -m "Ultraworked with [Sisyphus](https://github.com/code-yeongyu/oh-my-openagent)" -m "Co-authored-by: Sisyphus <clio-agent@sisyphuslabs.ai>"
```

---

## Task 11: Chat Panel and Conversation Hook

**Description:** Integrate `useChatStream`, selected companion, selected textbook, and persistence APIs into a classroom chat panel.

**Files:**
- Create: `src/renderer/src/chat/useConversation.ts`
- Create: `src/renderer/src/chat/ChatPanel.tsx`
- Test: `tests/renderer/chat-panel.test.tsx`

- [ ] **Step 1: Write failing tests**

Test with mocked `window.socratopia`:
- Sending first user message creates a conversation.
- User message is appended before stream starts.
- Token events update assistant draft content.
- End event appends assistant message.
- Existing messages are loaded when `conversationId` exists.

- [ ] **Step 2: Verify RED**

Run:

```powershell
npx vitest run tests/renderer/chat-panel.test.tsx
```

Expected: FAIL because hook/panel do not exist.

- [ ] **Step 3: Implement**

Requirements:
- Do not persist partial assistant tokens until stream end.
- If stream error occurs, keep user message and show retry/error state.
- Disable send when no companion is selected.
- If no textbook is selected, allow chat without textbook context but show neutral notice.

- [ ] **Step 4: Verify GREEN**

Run:

```powershell
npx vitest run tests/renderer/chat-panel.test.tsx
npm run typecheck:web
```

Expected: pass.

- [ ] **Step 5: Commit**

```powershell
$env:GIT_MASTER='1'; git add src/renderer/src/chat/useConversation.ts src/renderer/src/chat/ChatPanel.tsx tests/renderer/chat-panel.test.tsx
$env:GIT_MASTER='1'; git commit -m "Add streaming classroom chat panel" -m "Ultraworked with [Sisyphus](https://github.com/code-yeongyu/oh-my-openagent)" -m "Co-authored-by: Sisyphus <clio-agent@sisyphuslabs.ai>"
```

---

## Task 12: Full Classroom Loop Wiring

**Description:** Wire settings gate, companion selector, textbook importer, and chat panel into one app flow.

**Files:**
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/app-shell/AppShell.tsx`
- Modify: `src/main/index.ts`
- Test: `tests/renderer/classroom-loop.test.tsx`

- [ ] **Step 1: Write failing integration test**

Test that mocked app flow can:
- start with key present;
- render companion selector;
- select Alice;
- import textbook;
- send message;
- show assistant streamed content;
- persist assistant message on end.

- [ ] **Step 2: Verify RED**

Run:

```powershell
npx vitest run tests/renderer/classroom-loop.test.tsx
```

Expected: FAIL before wiring is complete.

- [ ] **Step 3: Wire app flow**

Requirements:
- `App` wraps `SettingsGate` around `ClassroomProvider` and `AppShell`.
- `AppShell` shows selected companion/textbook status.
- Register new main IPC handlers before the app window is ready.
- Do not change Electron security flags.

- [ ] **Step 4: Verify GREEN**

Run:

```powershell
npx vitest run tests/renderer/classroom-loop.test.tsx
npm test
npm run build
npm audit --audit-level=high
```

Expected: all pass.

- [ ] **Step 5: Manual QA**

Run:

```powershell
npm run dev
```

Manual checklist:
- No key: settings gate appears.
- Save key: main shell appears.
- Alice, Holmes, and Sun Wukong can be selected.
- Paste Markdown textbook and select it.
- Send message; assistant stream appears.
- Cancel stream stops current response.
- Close and reopen; latest conversation restores.
- Renderer dev console has no `fs`, `ipcRenderer`, or raw Electron imports.

- [ ] **Step 6: Commit**

```powershell
$env:GIT_MASTER='1'; git add src/renderer/src/App.tsx src/renderer/src/app-shell/AppShell.tsx src/main/index.ts tests/renderer/classroom-loop.test.tsx
$env:GIT_MASTER='1'; git commit -m "Wire core classroom loop" -m "Ultraworked with [Sisyphus](https://github.com/code-yeongyu/oh-my-openagent)" -m "Co-authored-by: Sisyphus <clio-agent@sisyphuslabs.ai>"
```

---

## Final Milestone 3 Quality Gate

- [ ] `npm test` passes.
- [ ] `npm run build` passes.
- [ ] `npm audit --audit-level=high` reports 0 high vulnerabilities.
- [ ] `npm run test:security` passes.
- [ ] Grep returns no source matches for forbidden renderer/main boundary patterns:

```powershell
# Use grep tool or equivalent regex search over src/
as any|@ts-ignore|@ts-expect-error|getDeepSeekKey|getKey\(|settings:get|settings:read|ipcRenderer\.on\('chat:|from 'electron'|from "electron"|from 'node:fs'|from "node:fs"
```

- [ ] Manual classroom loop passes.
- [ ] Visual/accessibility review passes:
  - Keyboard can reach settings form, companion cards, textbook importer, chat input, send, cancel.
  - `role="log"` chat updates are announced politely.
  - Icon-only buttons have `aria-label`.
  - Empty/loading/error states exist for settings, companions, textbooks, chat.
  - Layout works at 1024px and 1440px desktop widths.

---

## Risk Register

| Risk | Impact | Mitigation |
|---|---:|---|
| Markdown renderer accidentally enables raw HTML | High | Use Streamdown default path; test XSS vectors; do not add `rehype-raw` in Milestone 3. |
| Renderer receives local filesystem paths | High | File import reads browser `File` text and sends content only. Main owns storage paths. |
| Message persistence duplicates assistant content | Medium | Persist assistant draft only on end event; tests assert one assistant message per stream. |
| Conversation JSONL corruption after interrupted write | Medium | Append complete JSON line with newline; tests parse all lines; future compaction deferred. |
| Component tests become brittle | Medium | Test user-visible behavior and accessible roles, not Tailwind class details. |
| UI becomes generic AI slop | Medium | Use dark academic workspace direction; no purple gradient hero cards; build information-dense classroom layout. |

---

## Execution Handoff

Plan complete. Recommended execution mode:

1. **Subagent-Driven (recommended):** Dispatch one fresh implementation agent per task or per safe parallel wave, then review between tasks.
2. **Inline Execution:** Use superpowers:executing-plans and complete tasks sequentially with checkpoints.

Parallel waves:

- Wave 1: Tasks 1-4 can run mostly independently after Task 1 dependency install.
- Wave 2: Tasks 5-9 can run after backend APIs and renderer test harness exist.
- Wave 3: Tasks 10-12 are sequential because they integrate prior state and persistence.
