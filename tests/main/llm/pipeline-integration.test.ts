/**
 * Pipeline integration tests for the DeepSeek streaming pipeline.
 *
 * Tests the end-to-end flow: prompt-builder (buildMessages) →
 * StreamChatSession (with mock adapter) → token/end events.
 *
 * Also includes a static source check that src/main/index.ts has been
 * wired to the real DeepSeek adapter and no longer contains the
 * placeholder error message.
 */
import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'

import type {
  DeepSeekStreamAdapter,
  DeepSeekStreamChunk,
  StreamEvent
} from '../../../src/main/llm/stream-types'
import type { DeepSeekChatMessage } from '../../../src/main/llm/types'
import { StreamChatSession } from '../../../src/main/llm/stream-chat'
import { buildMessages } from '../../../src/main/prompt/prompt-builder'
import type { Companion } from '../../../src/shared/schemas/companion'
import { CompanionSource, CompanionGender } from '../../../src/shared/types/ids'

// ---------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------

function mockCompanion(overrides?: Partial<Companion>): Companion {
  return {
    id: 'candidate-socrates' as Companion['id'],
    source: CompanionSource.Candidate,
    name: 'Socrates',
    gender: CompanionGender.Male,
    age: 70,
    identity: 'Ancient Greek philosopher',
    personalityKeywords: ['wise', 'ironic', 'patient'],
    personality: 'You are Socrates, the father of Western philosophy.',
    speakingStyle: 'Speak in questions. Use analogies.',
    emotionalExpressions: 'Calm and amused.',
    originalFile: 'socrates.md',
    ...overrides,
  }
}

function tokenChunk(content: string): DeepSeekStreamChunk {
  return {
    choices: [{ delta: { content } }],
  }
}

function finishChunk(
  finishReason = 'stop',
  usage?: DeepSeekStreamChunk['usage']
): DeepSeekStreamChunk {
  return {
    choices: [{ finish_reason: finishReason }],
    usage,
  }
}

function mockStreamAdapter(
  chunks: DeepSeekStreamChunk[]
): DeepSeekStreamAdapter {
  return {
    streamChat: async function* () {
      for (const chunk of chunks) {
        yield chunk
      }
    },
  }
}

function collectEvents(
  session: StreamChatSession
): { events: StreamEvent[]; start: () => Promise<void> } {
  const events: StreamEvent[] = []
  const start = () => session.start()

  // We need to inject the event collector. Create a new session wrapper.
  throw new Error(
    'Internal: collectEvents not used. Use createSessionWithEvents instead.'
  )
}

function createSessionWithEvents(
  messages: DeepSeekChatMessage[],
  adapter: DeepSeekStreamAdapter
): { events: StreamEvent[]; start: () => Promise<void> } {
  const events: StreamEvent[] = []
  const session = new StreamChatSession(
    'pipeline-test',
    { messages, model: 'deepseek-v4-pro', apiKey: 'sk-test-pipeline' },
    adapter,
    (event: StreamEvent) => {
      events.push(event)
    }
  )
  return { events, start: () => session.start() }
}

// ---------------------------------------------------------------
// buildMessages() → StreamChatSession pipeline tests
// ---------------------------------------------------------------

describe('prompt-builder → StreamChatSession pipeline', () => {
  it('buildMessages() system prompt at index 0 feeds session with token and end events', async () => {
    const companion = mockCompanion()

    const messages = buildMessages({
      companion,
      worldContext: 'Ancient Athens, 399 BC.',
      userMessage: 'What is virtue?',
    })

    // --- Assert: system prompt is at index 0 ---
    expect(messages.length).toBeGreaterThanOrEqual(2)
    expect(messages[0].role).toBe('system')
    expect(messages[0].content.length).toBeGreaterThan(0)
    expect(messages[messages.length - 1].role).toBe('user')
    expect(messages[messages.length - 1].content).toBe('What is virtue?')

    // --- Feed through StreamChatSession with mock adapter ---
    const adapter = mockStreamAdapter([
      tokenChunk('Ah, '),
      tokenChunk('an excellent '),
      tokenChunk('question.'),
      finishChunk('stop', {
        prompt_tokens: 150,
        completion_tokens: 12,
        total_tokens: 162,
      }),
    ])

    const { events, start } = createSessionWithEvents(messages, adapter)
    await start()

    // --- Assert: token events emitted ---
    const tokens = events
      .filter((e) => e.type === 'token')
      .map((e) => (e as { token: string }).token)
    expect(tokens).toEqual(['Ah, ', 'an excellent ', 'question.'])

    // --- Assert: end event with finishReason ---
    const endEvent = events.find((e) => e.type === 'end')
    expect(endEvent).toBeDefined()
    expect((endEvent as { finishReason: string }).finishReason).toBe('stop')

    // --- Assert: usage event emitted ---
    const usageEvent = events.find((e) => e.type === 'usage')
    expect(usageEvent).toBeDefined()
    expect((usageEvent as { promptTokens: number }).promptTokens).toBe(150)
    expect(
      (usageEvent as { completionTokens: number }).completionTokens
    ).toBe(12)
    expect((usageEvent as { totalTokens: number }).totalTokens).toBe(162)
  })

  it('buildMessages() with history preserves system at index 0 and windows correctly', async () => {
    const companion = mockCompanion()
    const history: DeepSeekChatMessage[] = [
      { role: 'user', content: 'What is justice?' },
      { role: 'assistant', content: 'Let us examine that together.' },
    ]

    const messages = buildMessages({
      companion,
      worldContext: 'Athens.',
      history,
      userMessage: 'Tell me more about the forms.',
    })

    // System at index 0
    expect(messages[0].role).toBe('system')
    // History messages preserved (user + assistant)
    expect(messages[1].role).toBe('user')
    expect(messages[1].content).toBe('What is justice?')
    expect(messages[2].role).toBe('assistant')
    expect(messages[2].content).toBe('Let us examine that together.')
    // Current user message last
    expect(messages[3].role).toBe('user')
    expect(messages[3].content).toBe('Tell me more about the forms.')
  })

  it('pipeline handles tokens from buildMessages() with learner info and textbook', async () => {
    const companion = mockCompanion()

    const messages = buildMessages({
      companion,
      worldContext: 'Academy.',
      learnerInfo: 'Student, 15, curious about ethics.',
      textbookContent: 'The Apology of Socrates.',
      userMessage: 'Start the lesson.',
    })

    // All 6 segments should produce a substantial system prompt
    expect(messages[0].content.length).toBeGreaterThan(200)

    const adapter = mockStreamAdapter([
      tokenChunk('Welcome'),
      finishChunk('stop'),
    ])

    const { events, start } = createSessionWithEvents(messages, adapter)
    await start()

    const tokens = events
      .filter((e) => e.type === 'token')
      .map((e) => (e as { token: string }).token)
    expect(tokens).toEqual(['Welcome'])
    expect(events.some((e) => e.type === 'end')).toBe(true)
  })
})

// ---------------------------------------------------------------
// Static source test: index.ts adapter wiring
// ---------------------------------------------------------------

describe('src/main/index.ts adapter wiring', () => {
  it('imports createDeepSeekStreamAdapter from the adapter module', async () => {
    const content = await readFile('src/main/index.ts', 'utf-8')

    expect(content).toContain(
      "import { createDeepSeekStreamAdapter } from './llm/deepseek-stream-adapter'"
    )
  })

  it('no longer contains the placeholder error string', async () => {
    const content = await readFile('src/main/index.ts', 'utf-8')

    expect(content).not.toContain('Streaming adapter not yet implemented')
  })

  it('does not contain the placeholder async generator pattern', async () => {
    const content = await readFile('src/main/index.ts', 'utf-8')

    // The old placeholder was an `async function*` that threw an error.
    // After wiring, the factory should call adapter.streamChat(params).
    expect(content).not.toContain(
      "async function* (_params): AsyncIterable<DeepSeekStreamChunk>"
    )
  })
})
