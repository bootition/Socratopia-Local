import { describe, it, expect } from 'vitest'
import {
  CompanionSlot,
  CompanionSource,
  CompanionGender,
  MessageRole,
  ArtifactType,
  TextbookFormat
} from '../../src/shared/types/ids'
import type {
  ProfileId,
  WorldId,
  CompanionId,
  TextbookId,
  ConversationId,
  MessageId,
  ArtifactId
} from '../../src/shared/types/ids'

// --- Schema imports ---
import { ProfileSchema, type Profile } from '../../src/shared/schemas/profile'
import { WorldSchema, type World } from '../../src/shared/schemas/world'
import { CompanionSchema, type Companion } from '../../src/shared/schemas/companion'
import { TextbookSchema, type Textbook } from '../../src/shared/schemas/textbook'
import { ConversationSchema, type Conversation } from '../../src/shared/schemas/conversation'
import { MessageSchema, type Message } from '../../src/shared/schemas/message'
import { ArtifactSchema, type Artifact } from '../../src/shared/schemas/artifact'
import {
  IpcCreateWorldInputSchema,
  IpcImportCompanionInputSchema,
  IpcCreateTextbookInputSchema,
  IpcCreateConversationInputSchema,
  IpcSendMessageInputSchema,
  IpcEndClassInputSchema,
  IpcGetConversationInputSchema,
  IpcListConversationsInputSchema,
  IpcGetMessagesInputSchema,
  IpcGetArtifactInputSchema,
  IpcListArtifactsInputSchema,
  IpcDeleteConversationInputSchema,
  IpcUpdateTextbookContentInputSchema,
  IpcSearchMessagesInputSchema
} from '../../src/shared/schemas/ipc'

// ============================================================
// Helper: build valid objects for each domain type
// ============================================================

function validProfile(): Profile {
  return {
    id: 'prof_test001' as ProfileId,
    name: 'Test Profile',
    createdAt: '2026-07-06T12:00:00.000Z',
    updatedAt: '2026-07-06T12:00:00.000Z',
    activeWorldId: 'world_abc' as WorldId
  }
}

function validWorld(): World {
  return {
    id: 'world_test001' as WorldId,
    profileId: 'prof_test001' as ProfileId,
    name: 'Default World',
    story: '# Story\n\nOnce upon a time...',
    learnerProfile: '# Learner\n\nCurious student.',
    companionSlots: { a: null, b: null, c: null },
    createdAt: '2026-07-06T12:00:00.000Z',
    updatedAt: '2026-07-06T12:00:00.000Z'
  }
}

function validCompanion(): Companion {
  return {
    id: 'comp_alice01' as CompanionId,
    source: CompanionSource.Candidate,
    name: 'Alice',
    gender: CompanionGender.Female,
    age: 15,
    identity: '化工系本科一年级，少年大学生',
    personalityKeywords: ['好奇', '直觉'],
    personality: '十五岁天才少年...',
    speakingStyle: '语速快，思维跳跃',
    emotionalExpressions: '开心时笑得灿烂',
    originalFile: 'reference/角色设定/candidates/alice.md'
  }
}

function validTextbook(): Textbook {
  return {
    id: 'tb_001' as TextbookId,
    worldId: 'world_test001' as WorldId,
    title: 'Introduction to Chemistry',
    format: 'markdown',
    sourceFile: '/path/to/chem.md',
    content: '# Chemistry\n\nAtoms and molecules...',
    progress: { currentPage: 1, totalPages: null },
    createdAt: '2026-07-06T12:00:00.000Z',
    updatedAt: '2026-07-06T12:00:00.000Z'
  }
}

function validConversation(): Conversation {
  return {
    id: 'conv_001' as ConversationId,
    worldId: 'world_test001' as WorldId,
    companionId: 'comp_alice01' as CompanionId,
    textbookId: 'tb_001' as TextbookId,
    title: 'Chemistry with Alice',
    createdAt: '2026-07-06T12:00:00.000Z',
    updatedAt: '2026-07-06T12:00:00.000Z',
    endedAt: null
  }
}

function validMessage(): Message {
  return {
    id: 'msg_001' as MessageId,
    conversationId: 'conv_001' as ConversationId,
    role: 'user',
    content: 'What is an atom?',
    createdAt: '2026-07-06T12:00:01.000Z'
  }
}

function validArtifact(): Artifact {
  return {
    id: 'art_001' as ArtifactId,
    conversationId: 'conv_001' as ConversationId,
    type: 'lesson_summary',
    content: '# Summary\n\nToday we covered atoms...',
    createdAt: '2026-07-06T12:30:00.000Z'
  }
}

// ============================================================
// Profile Schema Tests
// ============================================================
describe('ProfileSchema', () => {
  it('accepts a valid profile', () => {
    const result = ProfileSchema.safeParse(validProfile())
    expect(result.success).toBe(true)
  })

  it('rejects a profile missing id', () => {
    const { id, ...rest } = validProfile()
    const result = ProfileSchema.safeParse(rest)
    expect(result.success).toBe(false)
  })

  it('rejects a profile with empty name', () => {
    const result = ProfileSchema.safeParse({ ...validProfile(), name: '' })
    expect(result.success).toBe(false)
  })

  it('rejects a profile with invalid ISO date', () => {
    const result = ProfileSchema.safeParse({ ...validProfile(), createdAt: 'not-a-date' })
    expect(result.success).toBe(false)
  })
})

// ============================================================
// World Schema Tests
// ============================================================
describe('WorldSchema', () => {
  it('accepts a valid world', () => {
    const result = WorldSchema.safeParse(validWorld())
    expect(result.success).toBe(true)
  })

  it('rejects a world missing companionSlots', () => {
    const { companionSlots, ...rest } = validWorld()
    const result = WorldSchema.safeParse(rest)
    expect(result.success).toBe(false)
  })

  it('rejects invalid companionSlots structure', () => {
    const result = WorldSchema.safeParse({ ...validWorld(), companionSlots: { x: null, y: null, z: null } })
    expect(result.success).toBe(false)
  })

  it('accepts companionSlots with CompanionSlot values a, b, c', () => {
    const result = WorldSchema.safeParse({
      ...validWorld(),
      companionSlots: { a: 'comp_1', b: null, c: 'comp_2' as Companion['id'] }
    })
    expect(result.success).toBe(true)
  })

  it('rejects companionSlots with extra keys', () => {
    const result = WorldSchema.safeParse({
      ...validWorld(),
      companionSlots: { a: null, b: null, c: null, d: 'extra' }
    })
    expect(result.success).toBe(false)
  })
})

// ============================================================
// Companion Schema Tests
// ============================================================
describe('CompanionSchema', () => {
  it('accepts a valid companion', () => {
    const result = CompanionSchema.safeParse(validCompanion())
    expect(result.success).toBe(true)
  })

  it('rejects a companion with invalid source', () => {
    const result = CompanionSchema.safeParse({ ...validCompanion(), source: 'alien' })
    expect(result.success).toBe(false)
  })

  it('rejects a companion with invalid gender', () => {
    const result = CompanionSchema.safeParse({ ...validCompanion(), gender: 'robot' })
    expect(result.success).toBe(false)
  })

  it('rejects a companion with negative age', () => {
    const result = CompanionSchema.safeParse({ ...validCompanion(), age: -1 })
    expect(result.success).toBe(false)
  })

  it('rejects a companion with empty personalityKeywords array', () => {
    const result = CompanionSchema.safeParse({ ...validCompanion(), personalityKeywords: [] })
    expect(result.success).toBe(false)
  })

  it('rejects a companion missing required fields', () => {
    const result = CompanionSchema.safeParse({ id: 'comp_x' })
    expect(result.success).toBe(false)
  })

  it('accepts a companion with Custom source', () => {
    const result = CompanionSchema.safeParse({
      ...validCompanion(),
      source: CompanionSource.Custom,
      originalFile: ''
    })
    expect(result.success).toBe(true)
  })
})

// ============================================================
// Textbook Schema Tests
// ============================================================
describe('TextbookSchema', () => {
  it('accepts a valid textbook', () => {
    const result = TextbookSchema.safeParse(validTextbook())
    expect(result.success).toBe(true)
  })

  it('rejects a textbook with unsupported format', () => {
    const result = TextbookSchema.safeParse({ ...validTextbook(), format: 'docx' })
    expect(result.success).toBe(false)
  })

  it('rejects a textbook with negative currentPage', () => {
    const result = TextbookSchema.safeParse({
      ...validTextbook(),
      progress: { currentPage: -1, totalPages: 10 }
    })
    expect(result.success).toBe(false)
  })

  it('accepts a textbook with null totalPages (unknown length)', () => {
    const result = TextbookSchema.safeParse({
      ...validTextbook(),
      progress: { currentPage: 1, totalPages: null }
    })
    expect(result.success).toBe(true)
  })

  it('accepts a pasted textbook (empty sourceFile)', () => {
    const result = TextbookSchema.safeParse({ ...validTextbook(), sourceFile: '' })
    expect(result.success).toBe(true)
  })

  it('rejects a textbook with empty content', () => {
    const result = TextbookSchema.safeParse({ ...validTextbook(), content: '' })
    expect(result.success).toBe(false)
  })
})

// ============================================================
// Conversation Schema Tests
// ============================================================
describe('ConversationSchema', () => {
  it('accepts a valid conversation', () => {
    const result = ConversationSchema.safeParse(validConversation())
    expect(result.success).toBe(true)
  })

  it('accepts a conversation with null textbookId', () => {
    const result = ConversationSchema.safeParse({ ...validConversation(), textbookId: null })
    expect(result.success).toBe(true)
  })

  it('rejects a conversation with empty title', () => {
    const result = ConversationSchema.safeParse({ ...validConversation(), title: '' })
    expect(result.success).toBe(false)
  })

  it('rejects a conversation missing worldId', () => {
    const { worldId, ...rest } = validConversation()
    const result = ConversationSchema.safeParse(rest)
    expect(result.success).toBe(false)
  })
})

// ============================================================
// Message Schema Tests
// ============================================================
describe('MessageSchema', () => {
  it('accepts a valid user message', () => {
    const result = MessageSchema.safeParse(validMessage())
    expect(result.success).toBe(true)
  })

  it('accepts an assistant message', () => {
    const result = MessageSchema.safeParse({
      ...validMessage(),
      role: MessageRole.Assistant,
      content: 'That is a great question! Let me think...'
    })
    expect(result.success).toBe(true)
  })

  it('accepts a system message', () => {
    const result = MessageSchema.safeParse({
      ...validMessage(),
      role: MessageRole.System,
      content: 'Class started.'
    })
    expect(result.success).toBe(true)
  })

  it('rejects a message with invalid role', () => {
    const result = MessageSchema.safeParse({ ...validMessage(), role: 'bot' })
    expect(result.success).toBe(false)
  })

  it('rejects a message with empty content', () => {
    const result = MessageSchema.safeParse({ ...validMessage(), content: '' })
    expect(result.success).toBe(false)
  })

  it('rejects a message with whitespace-only content', () => {
    const result = MessageSchema.safeParse({ ...validMessage(), content: '   \n  ' })
    expect(result.success).toBe(false)
  })
})

// ============================================================
// Artifact Schema Tests
// ============================================================
describe('ArtifactSchema', () => {
  it('accepts a valid lesson summary artifact', () => {
    const result = ArtifactSchema.safeParse(validArtifact())
    expect(result.success).toBe(true)
  })

  it('accepts a flashcards artifact', () => {
    const result = ArtifactSchema.safeParse({
      ...validArtifact(),
      type: ArtifactType.Flashcards,
      content: JSON.stringify([{ q: 'Q1', a: 'A1' }])
    })
    expect(result.success).toBe(true)
  })

  it('accepts a diary artifact', () => {
    const result = ArtifactSchema.safeParse({
      ...validArtifact(),
      type: ArtifactType.Diary,
      content: '## 2026-07-06\n\nToday was great...'
    })
    expect(result.success).toBe(true)
  })

  it('accepts a progress artifact', () => {
    const result = ArtifactSchema.safeParse({
      ...validArtifact(),
      type: ArtifactType.Progress,
      content: 'Current page: 42'
    })
    expect(result.success).toBe(true)
  })

  it('accepts a handoff_tail artifact', () => {
    const result = ArtifactSchema.safeParse({
      ...validArtifact(),
      type: ArtifactType.HandoffTail,
      content: JSON.stringify({ savedAt: '2026-07-06T12:00:00Z', messages: [] })
    })
    expect(result.success).toBe(true)
  })

  it('rejects an artifact with invalid type', () => {
    const result = ArtifactSchema.safeParse({ ...validArtifact(), type: 'unknown' })
    expect(result.success).toBe(false)
  })

  it('rejects an artifact with empty content', () => {
    const result = ArtifactSchema.safeParse({ ...validArtifact(), content: '' })
    expect(result.success).toBe(false)
  })
})

// ============================================================
// IPC Input Schema Tests
// ============================================================
describe('IPC input schemas', () => {
  describe('IpcCreateWorldInputSchema', () => {
    it('accepts valid input', () => {
      const result = IpcCreateWorldInputSchema.safeParse({
        profileId: 'prof_test001',
        name: 'My World'
      })
      expect(result.success).toBe(true)
    })

    it('rejects empty name', () => {
      const result = IpcCreateWorldInputSchema.safeParse({
        profileId: 'prof_test001',
        name: ''
      })
      expect(result.success).toBe(false)
    })

    it('rejects missing profileId', () => {
      const result = IpcCreateWorldInputSchema.safeParse({ name: 'My World' })
      expect(result.success).toBe(false)
    })
  })

  describe('IpcImportCompanionInputSchema', () => {
    it('accepts valid input from candidate file', () => {
      const result = IpcImportCompanionInputSchema.safeParse({
        worldId: 'world_test001',
        sourceFile: 'reference/角色设定/candidates/alice.md',
        slot: CompanionSlot.A
      })
      expect(result.success).toBe(true)
    })

    it('rejects invalid slot value', () => {
      const result = IpcImportCompanionInputSchema.safeParse({
        worldId: 'world_test001',
        sourceFile: 'alice.md',
        slot: 'd'
      })
      expect(result.success).toBe(false)
    })

    it('rejects empty sourceFile', () => {
      const result = IpcImportCompanionInputSchema.safeParse({
        worldId: 'world_test001',
        sourceFile: '',
        slot: CompanionSlot.B
      })
      expect(result.success).toBe(false)
    })
  })

  describe('IpcCreateTextbookInputSchema', () => {
    it('accepts valid file import input', () => {
      const result = IpcCreateTextbookInputSchema.safeParse({
        worldId: 'world_test001',
        title: 'Chemistry 101',
        format: TextbookFormat.Markdown,
        sourceFile: '/books/chem.md'
      })
      expect(result.success).toBe(true)
    })

    it('accepts valid pasted text input', () => {
      const result = IpcCreateTextbookInputSchema.safeParse({
        worldId: 'world_test001',
        title: 'My Notes',
        format: TextbookFormat.Text,
        sourceFile: '',
        content: 'This is pasted content.'
      })
      expect(result.success).toBe(true)
    })

    it('rejects missing title', () => {
      const result = IpcCreateTextbookInputSchema.safeParse({
        worldId: 'world_test001',
        format: TextbookFormat.Text
      })
      expect(result.success).toBe(false)
    })

    it('rejects unsupported format', () => {
      const result = IpcCreateTextbookInputSchema.safeParse({
        worldId: 'world_test001',
        title: 'Doc',
        format: 'docx'
      })
      expect(result.success).toBe(false)
    })
  })

  describe('IpcCreateConversationInputSchema', () => {
    it('accepts valid input with textbook', () => {
      const result = IpcCreateConversationInputSchema.safeParse({
        worldId: 'world_test001',
        companionId: 'comp_alice01',
        textbookId: 'tb_001',
        title: 'Chemistry Session'
      })
      expect(result.success).toBe(true)
    })

    it('accepts valid input without textbook', () => {
      const result = IpcCreateConversationInputSchema.safeParse({
        worldId: 'world_test001',
        companionId: 'comp_alice01',
        title: 'Free Chat'
      })
      expect(result.success).toBe(true)
    })

    it('rejects empty title', () => {
      const result = IpcCreateConversationInputSchema.safeParse({
        worldId: 'world_test001',
        companionId: 'comp_alice01',
        title: ''
      })
      expect(result.success).toBe(false)
    })
  })

  describe('IpcSendMessageInputSchema', () => {
    it('accepts valid input', () => {
      const result = IpcSendMessageInputSchema.safeParse({
        conversationId: 'conv_001',
        content: 'What is quantum mechanics?'
      })
      expect(result.success).toBe(true)
    })

    it('rejects empty content', () => {
      const result = IpcSendMessageInputSchema.safeParse({
        conversationId: 'conv_001',
        content: ''
      })
      expect(result.success).toBe(false)
    })
  })

  describe('IpcEndClassInputSchema', () => {
    it('accepts valid input', () => {
      const result = IpcEndClassInputSchema.safeParse({ conversationId: 'conv_001' })
      expect(result.success).toBe(true)
    })

    it('rejects missing conversationId', () => {
      const result = IpcEndClassInputSchema.safeParse({})
      expect(result.success).toBe(false)
    })
  })

  describe('IpcGetConversationInputSchema', () => {
    it('accepts valid input', () => {
      const result = IpcGetConversationInputSchema.safeParse({ conversationId: 'conv_001' })
      expect(result.success).toBe(true)
    })
  })

  describe('IpcListConversationsInputSchema', () => {
    it('accepts valid input with worldId', () => {
      const result = IpcListConversationsInputSchema.safeParse({ worldId: 'world_test001' })
      expect(result.success).toBe(true)
    })

    it('rejects missing worldId', () => {
      const result = IpcListConversationsInputSchema.safeParse({})
      expect(result.success).toBe(false)
    })
  })

  describe('IpcGetMessagesInputSchema', () => {
    it('accepts valid input', () => {
      const result = IpcGetMessagesInputSchema.safeParse({ conversationId: 'conv_001' })
      expect(result.success).toBe(true)
    })
  })

  describe('IpcGetArtifactInputSchema', () => {
    it('accepts valid input', () => {
      const result = IpcGetArtifactInputSchema.safeParse({ artifactId: 'art_001' })
      expect(result.success).toBe(true)
    })
  })

  describe('IpcListArtifactsInputSchema', () => {
    it('accepts valid input', () => {
      const result = IpcListArtifactsInputSchema.safeParse({ conversationId: 'conv_001' })
      expect(result.success).toBe(true)
    })
  })

  describe('IpcDeleteConversationInputSchema', () => {
    it('accepts valid input', () => {
      const result = IpcDeleteConversationInputSchema.safeParse({ conversationId: 'conv_001' })
      expect(result.success).toBe(true)
    })
  })

  describe('IpcUpdateTextbookContentInputSchema', () => {
    it('accepts valid input', () => {
      const result = IpcUpdateTextbookContentInputSchema.safeParse({
        textbookId: 'tb_001',
        content: '# Updated\n\nNew content here.'
      })
      expect(result.success).toBe(true)
    })

    it('rejects empty content', () => {
      const result = IpcUpdateTextbookContentInputSchema.safeParse({
        textbookId: 'tb_001',
        content: ''
      })
      expect(result.success).toBe(false)
    })
  })

  describe('IpcSearchMessagesInputSchema', () => {
    it('accepts valid input', () => {
      const result = IpcSearchMessagesInputSchema.safeParse({
        worldId: 'world_test001',
        query: 'atom'
      })
      expect(result.success).toBe(true)
    })

    it('rejects empty query', () => {
      const result = IpcSearchMessagesInputSchema.safeParse({
        worldId: 'world_test001',
        query: ''
      })
      expect(result.success).toBe(false)
    })

    it('rejects query shorter than 2 characters', () => {
      const result = IpcSearchMessagesInputSchema.safeParse({
        worldId: 'world_test001',
        query: 'a'
      })
      expect(result.success).toBe(false)
    })
  })
})
