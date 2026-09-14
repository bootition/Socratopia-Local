/**
 * Tests for createPromptRequestBuilder — the main-process glue that
 * turns a classroom IPC request into DeepSeek messages.
 *
 * These tests exercise the real local stores (companion index,
 * textbook store, conversation store) on a temp directory, so the
 * prompt is proven to come from trusted local data rather than from
 * renderer input.
 */
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { describe, it, expect, afterAll } from 'vitest'

import { createPromptRequestBuilder } from '../../../src/main/prompt/build-request'
import type { PromptRequestPaths } from '../../../src/main/prompt/build-request'
import { createTextbookFromText } from '../../../src/main/textbooks/textbook-store'
import { createConversation } from '../../../src/main/conversations/conversation-store'
import { appendMessage } from '../../../src/main/conversations/message-store'
import type { Companion } from '../../../src/shared/schemas/companion'
import { CompanionSource, CompanionGender } from '../../../src/shared/types/ids'
import { DEFAULT_PREFERENCES } from '../../../src/shared/schemas/preferences'

// ---------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------

const cleanupDirs: string[] = []

async function createTempDir(): Promise<string> {
  const dir = join(tmpdir(), `socratopia-buildreq-${randomUUID()}`)
  await mkdir(dir, { recursive: true })
  cleanupDirs.push(dir)
  return dir
}

afterAll(async () => {
  const { rm } = await import('node:fs/promises')
  await Promise.all(cleanupDirs.map((d) => rm(d, { recursive: true, force: true })))
})

const alice: Companion = {
  id: 'comp_alice' as Companion['id'],
  source: CompanionSource.Candidate,
  name: 'Alice',
  gender: CompanionGender.Female,
  age: 17,
  identity: '好奇的少女',
  personalityKeywords: ['好奇', '爱追问'],
  personality: '她对世界充满好奇。',
  speakingStyle: '她说话轻快。',
  emotionalExpressions: '她高兴时会笑。',
  originalFile: 'alice.md'
}

interface Fixture {
  paths: PromptRequestPaths
  root: string
}

async function createFixture(): Promise<Fixture> {
  const root = await createTempDir()
  const companionDir = join(root, 'companions')
  await mkdir(companionDir, { recursive: true })

  // index.json + character markdown, exactly like the initializer writes
  await writeFile(join(companionDir, 'index.json'), JSON.stringify([alice], null, 2), 'utf-8')
  await writeFile(join(companionDir, 'alice.md'), '# Alice\n', 'utf-8')

  const textbookDir = join(root, 'textbooks')
  const conversationDir = join(root, 'conversations')
  await mkdir(textbookDir, { recursive: true })
  await mkdir(conversationDir, { recursive: true })

  const storyPath = join(root, 'story.md')
  const learnerPath = join(root, 'learner.md')
  await writeFile(storyPath, '这是一座漂浮在云海上的学园。', 'utf-8')
  await writeFile(learnerPath, '称呼：小明\n擅长：物理', 'utf-8')

  return {
    root,
    paths: { companionDir, textbookDir, conversationDir, storyPath, learnerPath }
  }
}

// ---------------------------------------------------------------
// Tests
// ---------------------------------------------------------------

describe('createPromptRequestBuilder', () => {
  it('builds a system prompt with companion, world and learner context', async () => {
    const { paths } = await createFixture()
    const buildRequest = createPromptRequestBuilder(paths)

    const result = await buildRequest({
      companionId: 'comp_alice',
      textbookId: null,
      conversationId: null,
      userMessage: '什么是惯性？'
    })

    expect(result.model).toBe('deepseek-v4-pro')
    expect(result.messages).toHaveLength(2)
    expect(result.messages[0].role).toBe('system')
    expect(result.messages[0].content).toContain('Alice')
    expect(result.messages[0].content).toContain('漂浮在云海上的学园')
    expect(result.messages[0].content).toContain('小明')
    expect(result.messages[1]).toEqual({ role: 'user', content: '什么是惯性？' })
  })

  it('injects textbook content and windows conversation history', async () => {
    const { paths } = await createFixture()
    const textbook = await createTextbookFromText(paths.textbookDir, {
      worldId: 'world_default',
      title: '牛顿力学',
      format: 'markdown',
      content: '# 第一章 惯性\n\n物体保持静止或匀速直线运动。'
    })
    const conversation = await createConversation(paths.conversationDir, {
      worldId: 'world_default',
      companionId: 'comp_alice',
      textbookId: textbook.id,
      title: '惯性课'
    })
    await appendMessage(paths.conversationDir, conversation.id, {
      role: 'user',
      content: '上次我们聊到力。'
    })
    await appendMessage(paths.conversationDir, conversation.id, {
      role: 'assistant',
      content: '*她点点头。* 你还记得多少？'
    })
    // The renderer persists the current user message before streaming.
    await appendMessage(paths.conversationDir, conversation.id, {
      role: 'user',
      content: '什么是惯性？'
    })

    const buildRequest = createPromptRequestBuilder(paths)
    const result = await buildRequest({
      companionId: 'comp_alice',
      textbookId: textbook.id,
      conversationId: conversation.id,
      userMessage: '什么是惯性？'
    })

    const system = result.messages[0]
    expect(system.content).toContain('物体保持静止或匀速直线运动')

    // Grounding sources are returned for the citation panel, and the
    // prompt carries the matching [教材#N] marker plus the citation rules.
    expect(result.sources).toHaveLength(1)
    expect(result.sources[0].segmentId).toBe('seg_1')
    expect(result.sources[0].label).toContain('第一章 惯性')
    expect(system.content).toContain('[教材#1]')
    expect(system.content).toContain('教材引用规则')

    const history = result.messages.slice(1)
    // Trailing duplicate user message is dropped, then re-added once
    expect(history.map((m) => m.content)).toEqual([
      '上次我们聊到力。',
      '*她点点头。* 你还记得多少？',
      '什么是惯性？'
    ])
    expect(history[history.length - 1].role).toBe('user')
  })

  it('skips the world segment when story.md is empty', async () => {
    const { paths } = await createFixture()
    await writeFile(paths.storyPath, '', 'utf-8')
    const buildRequest = createPromptRequestBuilder(paths)

    const result = await buildRequest({
      companionId: 'comp_alice',
      textbookId: null,
      conversationId: null,
      userMessage: '你好'
    })

    expect(result.messages[0].content).not.toContain('你所在的世界')
    expect(result.messages).toHaveLength(2)
  })

  it('rejects an unknown companion id', async () => {
    const { paths } = await createFixture()
    const buildRequest = createPromptRequestBuilder(paths)

    await expect(
      buildRequest({
        companionId: 'comp_nobody',
        textbookId: null,
        conversationId: null,
        userMessage: '你好'
      })
    ).rejects.toThrow('这位同伴已被删除')
  })

  it('degrades to a lesson without grounding when the textbook is gone', async () => {
    const { paths } = await createFixture()
    const buildRequest = createPromptRequestBuilder(paths)

    const result = await buildRequest({
      companionId: 'comp_alice',
      textbookId: 'tb_missing_1',
      conversationId: null,
      userMessage: '你好'
    })

    expect(result.sources).toEqual([])
    expect(result.messages).toHaveLength(2)
  })

  it('honours an explicit model override', async () => {
    const { paths } = await createFixture()
    const buildRequest = createPromptRequestBuilder(paths)

    const result = await buildRequest({
      companionId: 'comp_alice',
      textbookId: null,
      conversationId: null,
      userMessage: '你好',
      model: 'deepseek-v4-flash'
    })

    expect(result.model).toBe('deepseek-v4-flash')
  })

  it('applies pace and narration preferences to the prompt', async () => {
    const { paths } = await createFixture()
    const buildRequest = createPromptRequestBuilder(paths)

    const result = await buildRequest({
      companionId: 'comp_alice',
      textbookId: null,
      conversationId: null,
      userMessage: '你好',
      preferences: {
        ...DEFAULT_PREFERENCES,
        pace: 'slow',
        narrationEnabled: false,
        model: 'deepseek-v4-flash'
      }
    })

    const system = result.messages[0].content
    expect(system).toContain('教学节奏：慢慢来')
    expect(system).toContain('旁白已关闭')
    expect(system).not.toContain('旁白与强调格式规则')
    expect(result.model).toBe('deepseek-v4-flash')
  })

  it('falls back to opening passages without citations when nothing matches', async () => {
    const { paths } = await createFixture()
    const textbook = await createTextbookFromText(paths.textbookDir, {
      worldId: 'world_default',
      title: '牛顿力学',
      format: 'markdown',
      content: '# 第一章 惯性\n\n物体保持静止或匀速直线运动。'
    })
    const buildRequest = createPromptRequestBuilder(paths)

    const result = await buildRequest({
      companionId: 'comp_alice',
      textbookId: textbook.id,
      conversationId: null,
      userMessage: '量子纠缠是什么'
    })

    expect(result.sources).toEqual([])
    expect(result.messages[0].content).toContain('第一章 惯性')
    expect(result.messages[0].content).not.toContain('[教材#')
    expect(result.messages[0].content).not.toContain('教材引用规则')
  })

  it('adds no citation rules when no textbook is selected', async () => {
    const { paths } = await createFixture()
    const buildRequest = createPromptRequestBuilder(paths)

    const result = await buildRequest({
      companionId: 'comp_alice',
      textbookId: null,
      conversationId: null,
      userMessage: '什么是惯性？'
    })

    expect(result.sources).toEqual([])
    expect(result.messages[0].content).not.toContain('教材引用规则')
  })
})
