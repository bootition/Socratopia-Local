import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFile, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { CompanionSchema } from '../../../src/shared/schemas/companion'
import { CompanionSource } from '../../../src/shared/types/ids'

// We import the yet-to-be-implemented modules.
// Tests will fail (RED) until implementation exists.
import { loadReferenceCompanions, type LoadCompanionsOptions } from '../../../src/main/companions/reference-loader'

const TEST_ID = `socratopia-loader-${randomUUID()}`
const tempDir = join(tmpdir(), TEST_ID)
const projectsRoot = join('D:', 'Socratopia-Local')
const candidatesDir = join(projectsRoot, 'reference', '角色设定', 'candidates')

beforeAll(async () => {
  await mkdir(tempDir, { recursive: true })
})

afterAll(async () => {
  await rm(tempDir, { recursive: true, force: true })
})

describe('loadReferenceCompanions', () => {
  it('returns exactly 9 companions from the real candidates directory', async () => {
    const result = await loadReferenceCompanions({
      candidatesDir,
      companionDir: tempDir
    })

    expect(result.companions).toHaveLength(9)
    expect(result.count).toBe(9)
  })

  it('every companion validates against CompanionSchema', async () => {
    const result = await loadReferenceCompanions({
      candidatesDir,
      companionDir: tempDir
    })

    for (const companion of result.companions) {
      const parsed = CompanionSchema.safeParse(companion)
      if (!parsed.success) {
        console.error(`Schema failure for ${companion.name}:`, parsed.error.issues)
      }
      expect(parsed.success).toBe(true)
    }
  })

  it('all companions have source = candidate', async () => {
    const result = await loadReferenceCompanions({
      candidatesDir,
      companionDir: tempDir
    })

    for (const companion of result.companions) {
      expect(companion.source).toBe(CompanionSource.Candidate)
    }
  })

  it('produces deterministic companion IDs', async () => {
    const result1 = await loadReferenceCompanions({
      candidatesDir,
      companionDir: tempDir
    })
    const result2 = await loadReferenceCompanions({
      candidatesDir,
      companionDir: tempDir
    })

    expect(result1.companions.map(c => c.id).sort())
      .toEqual(result2.companions.map(c => c.id).sort())
  })

  it('writes companion markdown copies to companionDir', async () => {
    const result = await loadReferenceCompanions({
      candidatesDir,
      companionDir: tempDir
    })

    for (const companion of result.companions) {
      const mdPath = join(tempDir, companion.originalFile)
      const content = await readFile(mdPath, 'utf-8')
      expect(content.length).toBeGreaterThan(0)
    }
  })

  it('writes index.json to companionDir with valid companion data', async () => {
    const result = await loadReferenceCompanions({
      candidatesDir,
      companionDir: tempDir
    })

    const indexPath = join(tempDir, 'index.json')
    const raw = await readFile(indexPath, 'utf-8')
    const parsed = JSON.parse(raw)

    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed).toHaveLength(9)

    for (const item of parsed) {
      const validated = CompanionSchema.safeParse(item)
      expect(validated.success).toBe(true)
    }
  })

  it('parses alice correctly (known file)', async () => {
    const result = await loadReferenceCompanions({
      candidatesDir,
      companionDir: tempDir
    })

    const alice = result.companions.find(c => c.name === '爱丽丝')
    expect(alice).toBeDefined()
    if (alice) {
      expect(alice.gender).toBe('female')
      expect(alice.age).toBe(15)
      expect(alice.identity).toContain('化工系')
      expect(alice.personalityKeywords.length).toBeGreaterThanOrEqual(2)
      expect(alice.personality.length).toBeGreaterThan(100)
      expect(alice.speakingStyle.length).toBeGreaterThan(10)
      expect(alice.emotionalExpressions.length).toBeGreaterThan(10)
      expect(alice.originalFile).toBe('alice.md')
    }
  })

  it('parses holmes correctly (known file)', async () => {
    const result = await loadReferenceCompanions({
      candidatesDir,
      companionDir: tempDir
    })

    const holmes = result.companions.find(c => c.name === '福尔摩斯')
    expect(holmes).toBeDefined()
    if (holmes) {
      expect(holmes.gender).toBe('male')
      expect(holmes.age).toBe(35)
      expect(holmes.identity).toContain('法医')
      expect(holmes.personalityKeywords.length).toBeGreaterThanOrEqual(2)
      expect(holmes.personality.length).toBeGreaterThan(100)
      expect(holmes.originalFile).toBe('holmes.md')
    }
  })

  it('throws on non-existent candidates directory', async () => {
    await expect(
      loadReferenceCompanions({
        candidatesDir: join(tempDir, 'nonexistent'),
        companionDir: join(tempDir, 'out')
      })
    ).rejects.toThrow()
  })
})
