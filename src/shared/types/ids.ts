// Branded ID types for domain entities
// Uses intersection with a unique symbol brand to prevent accidental mixing of IDs

declare const ProfileIdBrand: unique symbol
export type ProfileId = string & { readonly [ProfileIdBrand]: 'ProfileId' }

declare const WorldIdBrand: unique symbol
export type WorldId = string & { readonly [WorldIdBrand]: 'WorldId' }

declare const CompanionIdBrand: unique symbol
export type CompanionId = string & { readonly [CompanionIdBrand]: 'CompanionId' }

declare const TextbookIdBrand: unique symbol
export type TextbookId = string & { readonly [TextbookIdBrand]: 'TextbookId' }

declare const ConversationIdBrand: unique symbol
export type ConversationId = string & { readonly [ConversationIdBrand]: 'ConversationId' }

declare const MessageIdBrand: unique symbol
export type MessageId = string & { readonly [MessageIdBrand]: 'MessageId' }

declare const ArtifactIdBrand: unique symbol
export type ArtifactId = string & { readonly [ArtifactIdBrand]: 'ArtifactId' }

// --- Enums ---

/** Which NPC slot in the world a companion occupies */
export const CompanionSlot = {
  A: 'a',
  B: 'b',
  C: 'c'
} as const
export type CompanionSlot = (typeof CompanionSlot)[keyof typeof CompanionSlot]

/** Role of a message in a conversation */
export const MessageRole = {
  User: 'user',
  Assistant: 'assistant',
  System: 'system'
} as const
export type MessageRole = (typeof MessageRole)[keyof typeof MessageRole]

/** Type of lesson artifact produced at end of class */
export const ArtifactType = {
  LessonSummary: 'lesson_summary',
  Flashcards: 'flashcards',
  Diary: 'diary',
  Progress: 'progress',
  HandoffTail: 'handoff_tail'
} as const
export type ArtifactType = (typeof ArtifactType)[keyof typeof ArtifactType]

/** Supported textbook source formats */
export const TextbookFormat = {
  Markdown: 'markdown',
  Text: 'text',
  Pdf: 'pdf',
  Epub: 'epub'
} as const
export type TextbookFormat = (typeof TextbookFormat)[keyof typeof TextbookFormat]

/** Where a companion originated */
export const CompanionSource = {
  Candidate: 'candidate',
  Custom: 'custom'
} as const
export type CompanionSource = (typeof CompanionSource)[keyof typeof CompanionSource]

/** Companion gender options */
export const CompanionGender = {
  Male: 'male',
  Female: 'female',
  Other: 'other'
} as const
export type CompanionGender = (typeof CompanionGender)[keyof typeof CompanionGender]
