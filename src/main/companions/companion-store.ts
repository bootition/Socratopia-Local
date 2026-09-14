/**
 * Custom companion management (F34).
 *
 * Custom companions live in the same companion directory/index as the
 * 9 reference candidates, with `source: 'custom'` and a
 * `comp_custom_*` id, so the selector and the prompt builder pick them
 * up without any special casing.
 */

import { readFile, writeFile, rm, access } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Companion } from '../../shared/schemas/companion'
import { CompanionSchema } from '../../shared/schemas/companion'
import {
  CompanionGender,
  CompanionSource,
  type CompanionId
} from '../../shared/types/ids'
import { readCompanionIndex } from '../ipc/companions'
import { writeCompanionIndexAtomically } from './companion-index'

export interface CustomCompanionInput {
  name: string
  gender: CompanionGender
  age: number
  identity: string
  personalityKeywords: string[]
  personality: string
  speakingStyle: string
  emotionalExpressions: string
}

const GENDER_LABEL: Record<CompanionGender, string> = {
  [CompanionGender.Male]: '男',
  [CompanionGender.Female]: '女',
  [CompanionGender.Other]: '其他'
}

function slugify(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return slug.length > 0 ? slug : randomUUID().slice(0, 8)
}

/** Fields interpolated into the system prompt must stay single-line. */
function assertSingleLine(value: string, label: string, maxLength: number): void {
  if (/[\r\n\u0000-\u001f]/.test(value)) {
    throw new Error(`${label}不能包含换行或控制字符`)
  }
  if (value.length > maxLength) {
    throw new Error(`${label}过长（最多 ${maxLength} 字）`)
  }
}

function validateInput(input: CustomCompanionInput): void {
  if (input.name.trim().length === 0) throw new Error('角色名字不能为空')
  if (input.identity.trim().length === 0) throw new Error('身份不能为空')
  if (input.personality.trim().length === 0) throw new Error('性格描述不能为空')
  if (!Number.isInteger(input.age) || input.age < 0 || input.age > 999) {
    throw new Error('年龄必须是 0-999 的整数')
  }
  if (input.personalityKeywords.length === 0) {
    throw new Error('至少需要一个性格关键词')
  }
  if (input.personalityKeywords.length > 12) {
    throw new Error('性格关键词最多 12 个')
  }

  assertSingleLine(input.name.trim(), '名字', 50)
  assertSingleLine(input.identity.trim(), '身份', 200)
  for (const keyword of input.personalityKeywords) {
    assertSingleLine(keyword.trim(), '性格关键词', 30)
  }
  if (input.personality.length > 4000) throw new Error('性格描述过长')
  if (input.speakingStyle.length > 4000) throw new Error('说话风格过长')
  if (input.emotionalExpressions.length > 4000) throw new Error('情绪表现过长')
}

function renderMarkdown(input: CustomCompanionInput): string {
  return [
    `# ${input.name.trim()}`,
    '',
    '## 基本信息',
    '',
    `- **姓名**：${input.name.trim()}`,
    `- **性别**：${GENDER_LABEL[input.gender]}`,
    `- **年龄**：${input.age}`,
    `- **身份**：${input.identity.trim()}`,
    `- **性格关键词**：${input.personalityKeywords.join('、')}`,
    '',
    '## 性格详写',
    '',
    input.personality.trim(),
    '',
    '## 说话风格与示例',
    '',
    input.speakingStyle.trim(),
    '',
    '## 情绪表现',
    '',
    input.emotionalExpressions.trim(),
    ''
  ].join('\n')
}

function isNotFound(err: unknown): boolean {
  return (
    err instanceof Error &&
    'code' in err &&
    (err as NodeJS.ErrnoException).code === 'ENOENT'
  )
}

/**
 * Read the companion index.
 *
 * A missing file means "no companions yet" (safe to create). Any other
 * failure (corrupt JSON, invalid entries, IO error) must abort the
 * write — otherwise a single corrupt index would silently erase all
 * reference candidates on the next custom-companion save.
 */
async function readIndexOrDefault(companionDir: string): Promise<Companion[]> {
  try {
    return await readCompanionIndex(companionDir)
  } catch (err: unknown) {
    if (isNotFound(err)) return []
    throw new Error(
      '同伴索引文件无法读取（可能已损坏）。为保护现有角色已停止写入，请检查或删除 index.json 后重试。'
    )
  }
}

async function writeIndex(companionDir: string, companions: Companion[]): Promise<void> {
  await writeCompanionIndexAtomically(companionDir, companions)
}

function companionFilename(id: string): string {
  return `${id}.md`
}

/** Create a custom companion and add it to the local index. */
async function createCustomCompanionInternal(
  companionDir: string,
  input: CustomCompanionInput
): Promise<Companion> {
  validateInput(input)

  const companions = await readIndexOrDefault(companionDir)
  let id: CompanionId = `comp_custom_${slugify(input.name)}` as CompanionId
  if (companions.some((c) => c.id === id)) {
    id = `${id}_${randomUUID().slice(0, 6)}` as CompanionId
  }

  const companion = CompanionSchema.parse({
    id,
    source: CompanionSource.Custom,
    name: input.name.trim(),
    gender: input.gender,
    age: input.age,
    identity: input.identity.trim(),
    personalityKeywords: input.personalityKeywords.map((k) => k.trim()).filter(Boolean),
    personality: input.personality.trim(),
    speakingStyle: input.speakingStyle.trim(),
    emotionalExpressions: input.emotionalExpressions.trim(),
    originalFile: companionFilename(id)
  }) as Companion

  await writeFile(
    join(companionDir, companion.originalFile),
    renderMarkdown(input),
    'utf-8'
  )
  await writeIndex(companionDir, [...companions, companion])
  return companion
}

/** Update an existing custom companion (candidates cannot be edited). */
async function updateCustomCompanionInternal(
  companionDir: string,
  companionId: string,
  input: CustomCompanionInput
): Promise<Companion> {
  validateInput(input)

  const companions = await readIndexOrDefault(companionDir)
  const index = companions.findIndex((c) => c.id === companionId)
  if (index === -1) throw new Error('Companion not found')
  if (companions[index].source !== CompanionSource.Custom) {
    throw new Error('只能编辑自定义角色')
  }

  const updated = CompanionSchema.parse({
    ...companions[index],
    name: input.name.trim(),
    gender: input.gender,
    age: input.age,
    identity: input.identity.trim(),
    personalityKeywords: input.personalityKeywords.map((k) => k.trim()).filter(Boolean),
    personality: input.personality.trim(),
    speakingStyle: input.speakingStyle.trim(),
    emotionalExpressions: input.emotionalExpressions.trim()
  }) as Companion

  companions[index] = updated
  await writeFile(
    join(companionDir, updated.originalFile),
    renderMarkdown(input),
    'utf-8'
  )
  await writeIndex(companionDir, companions)
  return updated
}

/** Delete a custom companion and its markdown file. */
async function deleteCustomCompanionInternal(
  companionDir: string,
  companionId: string
): Promise<void> {
  const companions = await readIndexOrDefault(companionDir)
  const companion = companions.find((c) => c.id === companionId)
  if (companion === undefined) throw new Error('Companion not found')
  if (companion.source !== CompanionSource.Custom) {
    throw new Error('只能删除自定义角色')
  }

  try {
    await access(join(companionDir, companion.originalFile))
    await rm(join(companionDir, companion.originalFile), { force: true })
  } catch {
    // Markdown file already gone — still remove the index entry.
  }

  await writeIndex(
    companionDir,
    companions.filter((c) => c.id !== companionId)
  )
}

// ---------------------------------------------------------------
// Serialized writes
// ---------------------------------------------------------------

/**
 * Read-modify-write operations on index.json are serialized per
 * directory. Without this, two quick saves (or a save racing a delete)
 * could both read the same index and the last writer would drop the
 * other companion.
 */
const writeQueues = new Map<string, Promise<unknown>>()

function enqueue<T>(companionDir: string, task: () => Promise<T>): Promise<T> {
  const previous = writeQueues.get(companionDir) ?? Promise.resolve()
  const next = previous.then(task, task)
  writeQueues.set(
    companionDir,
    next.then(
      () => undefined,
      () => undefined
    )
  )
  return next
}

/** Create a custom companion and add it to the local index. */
export function createCustomCompanion(
  companionDir: string,
  input: CustomCompanionInput
): Promise<Companion> {
  return enqueue(companionDir, () => createCustomCompanionInternal(companionDir, input))
}

/** Update an existing custom companion (candidates cannot be edited). */
export function updateCustomCompanion(
  companionDir: string,
  companionId: string,
  input: CustomCompanionInput
): Promise<Companion> {
  return enqueue(companionDir, () =>
    updateCustomCompanionInternal(companionDir, companionId, input)
  )
}

/** Delete a custom companion and its markdown file. */
export function deleteCustomCompanion(
  companionDir: string,
  companionId: string
): Promise<void> {
  return enqueue(companionDir, () =>
    deleteCustomCompanionInternal(companionDir, companionId)
  )
}
