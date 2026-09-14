/**
 * Tests for createEndClassGenerator — end-class artifact generation,
 * partial failure handling, and partial re-runs (F04).
 */
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it, vi, type MockedFunction } from 'vitest'

import { ArtifactStore } from '../../../src/main/artifacts/artifact-store'
import {
  createEndClassGenerator,
  EndClassGenerationError,
  type EndClassInput,
  type EndClassLlmCaller
} from '../../../src/main/artifacts/end-class-generator'
import { ArtifactStatus } from '../../../src/shared/schemas/artifact'
import { ArtifactType } from '../../../src/shared/types/ids'
import type { Companion } from '../../../src/shared/schemas/companion'
import { CompanionGender, CompanionSource } from '../../../src/shared/types/ids'
import type { Message } from '../../../src/shared/schemas/message'
import type { TextbookMetadata } from '../../../src/shared/schemas/textbook'

const cleanupDirs: string[] = []

async function createTempDir(): Promise<string> {
  const dir = join(tmpdir(), `socratopia-endclass-${randomUUID()}`)
  await rm(dir, { recursive: true, force: true })
  cleanupDirs.push(dir)
  return dir
}

afterAll(async () => {
  await Promise.all(cleanupDirs.map((d) => rm(d, { recursive: true, force: true })))
})

const companion: Companion = {
  id: 'comp_alice' as Companion['id'],
  source: CompanionSource.Candidate,
  name: 'Alice',
  gender: CompanionGender.Female,
  age: 17,
  identity: '好奇的少女',
  personalityKeywords: ['好奇'],
  personality: '她对世界充满好奇。',
  speakingStyle: '她说话轻快。',
  emotionalExpressions: '她高兴时会笑。',
  originalFile: 'alice.md'
}

const textbook: TextbookMetadata = {
  id: 'tb_1' as TextbookMetadata['id'],
  worldId: 'world_default' as TextbookMetadata['worldId'],
  title: '牛顿力学',
  format: 'markdown',
  sourceFile: 'source.md',
  originalFile: null,
  progress: { currentPage: 0, totalPages: null },
  createdAt: '2026-09-14T09:00:00.000Z',
  updatedAt: '2026-09-14T09:00:00.000Z'
}

const history: Message[] = [
  {
    id: 'msg_1' as Message['id'],
    conversationId: 'conv_1' as Message['conversationId'],
    role: 'user',
    content: '什么是惯性？',
    createdAt: '2026-09-14T09:05:00.000Z'
  },
  {
    id: 'msg_2' as Message['id'],
    conversationId: 'conv_1' as Message['conversationId'],
    role: 'assistant',
    content: '*她点点头。* 想想看，刹车时人会怎样？',
    createdAt: '2026-09-14T09:06:00.000Z'
  }
]

const FULL_OUTPUT = `===FAREWELL===
下次见。

===SUMMARY_MD===
本节理解惯性的直觉与例子。

===FLASHCARDS_JSON===
[{"question": "惯性是什么？", "answer": "物体保持运动状态的性质", "explanation": "第一段"}]

===DIARY_ENTRY===
今天和 Alice 学了惯性。

===PROGRESS_MD===
当前页码：2
掌握良好，下次做例题。

===HANDOFF_TAIL_JSON===
[{"role": "user", "content": "什么是惯性？"}, {"role": "assistant", "content": "想想看……"}]

===END===`

const REDO_FLASHCARDS_OUTPUT = `===FAREWELL===
好，我们下次继续。

===SUMMARY_MD===

===FLASHCARDS_JSON===
[{"question": "刹车时人为什么前倾？", "answer": "因为惯性", "explanation": "生活例子"}]

===DIARY_ENTRY===

===PROGRESS_MD===

===HANDOFF_TAIL_JSON===

===END===`

function makeInput(overrides: Partial<EndClassInput> = {}): EndClassInput {
  return {
    conversationId: 'conv_1',
    companion,
    textbook,
    history,
    model: 'deepseek-v4-pro',
    ...overrides
  }
}

function createGenerator(callModel: MockedFunction<EndClassLlmCaller>) {
  const root = createTempDir()
  return root.then((dir) => ({
    root: dir,
    store: new ArtifactStore(dir),
    generator: createEndClassGenerator({
      store: new ArtifactStore(dir),
      callModel,
      now: () => new Date('2026-09-14T10:00:00.000Z')
    })
  }))
}

describe('createEndClassGenerator', () => {
  it('generates and persists all five artifacts', async () => {
    const callModel = vi.fn<EndClassLlmCaller>().mockResolvedValue(FULL_OUTPUT)
    const { store, generator } = await createGenerator(callModel)

    const result = await generator.generate(makeInput())

    expect(result.failed).toEqual([])
    expect(result.record.summary).toContain('惯性')
    expect(result.record.flashcards).toHaveLength(1)
    expect(result.record.diary).toContain('Alice')
    expect(result.record.progress).toContain('当前页码：2')
    expect(result.record.handoffTail).toHaveLength(2)
    expect(result.record.status.lesson_summary).toBe(ArtifactStatus.Complete)

    // Persisted record matches the returned one
    expect(await store.read('conv_1')).toEqual(result.record)

    // The prompt carries classroom context and the tag protocol
    const call = callModel.mock.calls[0][0]
    expect(call.model).toBe('deepseek-v4-pro')
    expect(call.messages[0].content).toContain('===SUMMARY_MD===')
    expect(call.messages[1].content).toContain('牛顿力学')
    expect(call.messages[1].content).toContain('什么是惯性？')
  })

  it('reports per-artifact failures and keeps the successful ones', async () => {
    const partial = FULL_OUTPUT.replace(
      /===FLASHCARDS_JSON===[\s\S]*?(?====DIARY_ENTRY===)/,
      '===FLASHCARDS_JSON===\n{ not valid json\n'
    )
    const callModel = vi.fn<EndClassLlmCaller>().mockResolvedValue(partial)
    const { store, generator } = await createGenerator(callModel)

    const result = await generator.generate(makeInput())

    expect(result.failed).toEqual([ArtifactType.Flashcards])
    expect(result.record.flashcards).toBeNull()
    expect(result.record.summary).not.toBeNull()
    expect(result.record.status.flashcards).toBe(ArtifactStatus.Failed)
    expect(result.record.status.lesson_summary).toBe(ArtifactStatus.Complete)
    expect((await store.read('conv_1'))!.flashcards).toBeNull()
  })

  it('saves raw output and throws when the farewell is missing', async () => {
    const callModel = vi.fn<EndClassLlmCaller>().mockResolvedValue('completely broken output')
    const { store, generator } = await createGenerator(callModel)

    await expect(generator.generate(makeInput())).rejects.toThrow(
      EndClassGenerationError
    )

    expect(await store.readRaw('conv_1')).toBe('completely broken output')
    const record = await store.read('conv_1')
    expect(record!.status.lesson_summary).toBe(ArtifactStatus.Failed)
    expect(record!.rawOutputFile).toBe('raw-end-class.txt')
  })

  it('re-runs only the requested artifacts and keeps the previous ones', async () => {
    const callModel = vi
      .fn<EndClassLlmCaller>()
      .mockResolvedValueOnce(FULL_OUTPUT)
      .mockResolvedValueOnce(REDO_FLASHCARDS_OUTPUT)
    const { store, generator } = await createGenerator(callModel)

    await generator.generate(makeInput())
    const redone = await generator.generate(
      makeInput({ only: [ArtifactType.Flashcards] })
    )

    // Flashcards were replaced by the redo…
    expect(redone.record.flashcards![0].question).toBe('刹车时人为什么前倾？')
    // …while everything else survived the redo.
    expect(redone.record.summary).toContain('惯性')
    expect(redone.record.diary).toContain('Alice')
    expect(redone.record.progress).toContain('当前页码：2')
    expect(redone.failed).toEqual([])
    expect((await store.read('conv_1'))!.flashcards![0].question).toBe(
      '刹车时人为什么前倾？'
    )
  })

  it('keeps the previous record when the LLM call itself fails', async () => {
    const callModel = vi
      .fn<EndClassLlmCaller>()
      .mockResolvedValueOnce(FULL_OUTPUT)
      .mockRejectedValueOnce(new Error('DeepSeek API error (HTTP 503)'))
    const { store, generator } = await createGenerator(callModel)

    await generator.generate(makeInput())
    await expect(generator.generate(makeInput())).rejects.toThrow(
      'DeepSeek API error (HTTP 503)'
    )

    // Previous artifacts are untouched
    expect((await store.read('conv_1'))!.summary).toContain('惯性')
  })
})
