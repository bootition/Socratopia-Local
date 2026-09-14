/**
 * Artifacts IPC regression tests.
 *
 * The end-class handler must commit the lesson's progress back to the
 * textbook (otherwise the progress page / library / PDF reader stay at
 * page 0 forever — the bug this test locks down).
 */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it, vi } from 'vitest'

const { handlers } = vi.hoisted(() => ({
  handlers: new Map<
    string,
    (event: unknown, input: unknown) => Promise<unknown>
  >()
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (
      channel: string,
      handler: (event: unknown, input: unknown) => Promise<unknown>
    ) => {
      handlers.set(channel, handler)
    }
  }
}))

import type { ArtifactStore } from '../../../src/main/artifacts/artifact-store'
import type { EndClassGenerator } from '../../../src/main/artifacts/end-class-generator'
import { registerArtifactIpc } from '../../../src/main/ipc/artifacts'
import { createConversation } from '../../../src/main/conversations/conversation-store'
import { appendMessage } from '../../../src/main/conversations/message-store'
import {
  createTextbookFromText,
  getTextbook,
  updateTextbookProgress
} from '../../../src/main/textbooks/textbook-store'
import { ARTIFACTS_END_CLASS } from '../../../src/shared/channel-names'
import { DEFAULT_PREFERENCES } from '../../../src/shared/schemas/preferences'

const cleanupDirs: string[] = []

async function createRoot(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'socratopia-artifacts-ipc-'))
  cleanupDirs.push(dir)
  return dir
}

afterAll(async () => {
  await Promise.all(
    cleanupDirs.map((dir) => rm(dir, { recursive: true, force: true }))
  )
})

async function setup(): Promise<{
  companionDir: string
  textbookDir: string
  conversationDir: string
  textbookId: string
  conversationId: string
}> {
  const root = await createRoot()

  const companionDir = join(root, 'companions')
  await mkdir(companionDir, { recursive: true })
  await writeFile(
    join(companionDir, 'index.json'),
    JSON.stringify([
      {
        id: 'comp_alice',
        source: 'candidate',
        name: '爱丽丝',
        gender: 'female',
        age: 17,
        identity: '好奇的少女',
        personalityKeywords: ['好奇'],
        personality: '喜欢追问。',
        speakingStyle: '轻声细语。',
        emotionalExpressions: '开心时会笑。',
        originalFile: 'alice.md'
      }
    ]),
    'utf-8'
  )

  const textbookDir = join(root, 'textbooks')
  const textbook = await createTextbookFromText(textbookDir, {
    worldId: 'world_default',
    title: '惯性',
    format: 'markdown',
    content: '# 惯性\n\n惯性是物体保持原有运动状态的性质。'
  })
  // Pretend it is a 2-page textbook so the clamp is meaningful.
  await updateTextbookProgress(textbookDir, textbook.id, { totalPages: 2 })

  const conversationDir = join(root, 'conversations')
  const conversation = await createConversation(conversationDir, {
    worldId: 'world_default',
    companionId: 'comp_alice',
    textbookId: textbook.id,
    title: '惯性课'
  })
  await appendMessage(conversationDir, conversation.id, {
    role: 'user',
    content: '什么是惯性？'
  })

  return {
    companionDir,
    textbookDir,
    conversationDir,
    textbookId: textbook.id,
    conversationId: conversation.id
  }
}

function register(
  dirs: {
    companionDir: string
    textbookDir: string
    conversationDir: string
  },
  generate: ReturnType<typeof vi.fn>
): void {
  registerArtifactIpc({
    ...dirs,
    store: {} as ArtifactStore,
    generator: { generate } as unknown as EndClassGenerator,
    readApiKey: async () => 'sk-test',
    readPreferences: async () => DEFAULT_PREFERENCES
  })
}

describe('artifacts IPC — end class', () => {
  it('commits the parsed page and progress markdown back to the textbook', async () => {
    const dirs = await setup()
    const generate = vi.fn(async (_input: unknown) => ({
      record: {
        conversationId: dirs.conversationId,
        generatedAt: new Date().toISOString(),
        model: 'deepseek-v4-flash',
        farewell: '下次见',
        status: 'complete',
        summary: '总结',
        flashcards: null,
        diary: null,
        progress: '## 学习进度\n- 当前页码：999\n- 已掌握：惯性',
        handoffTail: null,
        rawOutputFile: null
      },
      failed: []
    }))
    register(dirs, generate)

    const handler = handlers.get(ARTIFACTS_END_CLASS)
    expect(handler).toBeDefined()
    await handler!({}, {
      conversationId: dirs.conversationId,
      companionId: 'comp_alice',
      textbookId: dirs.textbookId
    })

    expect(generate).toHaveBeenCalledTimes(1)

    const updated = await getTextbook(dirs.textbookDir, dirs.textbookId)
    // Clamped to the known total page count.
    expect(updated.progress.currentPage).toBe(2)

    const progressFile = await readFile(
      join(dirs.textbookDir, dirs.textbookId, 'progress.md'),
      'utf-8'
    )
    expect(progressFile).toContain('已掌握：惯性')
  })

  it('still finishes the lesson when the textbook was deleted', async () => {
    const dirs = await setup()
    const generate = vi.fn(async (_input: unknown) => ({
      record: {
        conversationId: dirs.conversationId,
        generatedAt: new Date().toISOString(),
        model: 'deepseek-v4-flash',
        farewell: '下次见',
        status: 'complete',
        summary: null,
        flashcards: null,
        diary: null,
        progress: null,
        handoffTail: null,
        rawOutputFile: null
      },
      failed: []
    }))
    register(dirs, generate)

    const handler = handlers.get(ARTIFACTS_END_CLASS)!
    await handler({}, {
      conversationId: dirs.conversationId,
      companionId: 'comp_alice',
      textbookId: 'tb_missing_1'
    })

    // Generated without grounding, and the deleted textbook is untouched.
    expect(generate).toHaveBeenCalledTimes(1)
    const callArg = generate.mock.calls[0]?.[0] as { textbook: unknown }
    expect(callArg.textbook).toBeNull()
  })
})
