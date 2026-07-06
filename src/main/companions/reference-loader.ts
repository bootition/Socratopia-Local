import { readdir, readFile, copyFile, writeFile, access, mkdir } from 'node:fs/promises'
import { join, basename } from 'node:path'
import type { Companion } from '../../shared/schemas/companion'
import { CompanionSchema } from '../../shared/schemas/companion'
import type { CompanionId } from '../../shared/types/ids'
import { CompanionSource, CompanionGender } from '../../shared/types/ids'

export interface LoadCompanionsOptions {
  /** Directory containing candidate .md files */
  candidatesDir: string
  /** Directory where companions will be stored */
  companionDir: string
}

export interface LoadCompanionsResult {
  companions: Companion[]
  count: number
}

/**
 * Parse a character markdown file into a Companion metadata object.
 *
 * Expected format:
 *   # Name
 *   ## 基本信息
 *   - **姓名**：Name
 *   - **性别**：Gender
 *   - **年龄**：Age
 *   - **身份**：Identity
 *   - **性格关键词**：Keywords
 *   ## 性格详写
 *   (personality section)
 *   ## 说话风格与示例
 *   (speaking style section)
 *   ## 情绪表现
 *   (emotional expressions section)
 */
function parseCompanionMarkdown(content: string, id: CompanionId, originalFile: string): Companion {
  const name = extractSection(content, /^# (.+)$/m, 1)
  const basicInfo = extractSectionContent(content, '基本信息')

  const genderText = extractField(basicInfo, '性别')
  const ageText = extractField(basicInfo, '年龄')
  const identity = extractField(basicInfo, '身份')
  const keywordsRaw = extractField(basicInfo, '性格关键词')

  const personality = extractSectionContent(content, '性格详写')
  const speakingStyle = extractSectionContent(content, '说话风格与示例')
  const emotionalExpressions = extractSectionContent(content, '情绪表现')

  // Parse gender
  let gender: CompanionGender
  if (genderText === '女') {
    gender = CompanionGender.Female
  } else if (genderText === '男') {
    gender = CompanionGender.Male
  } else {
    throw new Error(`Unknown gender "${genderText}" in ${originalFile}`)
  }

  const age = parseInt(ageText.replace(/[^0-9]/g, ''), 10)
  if (isNaN(age)) {
    throw new Error(`Could not parse age from "${ageText}" in ${originalFile}`)
  }

  const personalityKeywords = parseKeywords(keywordsRaw)

  return {
    id,
    source: CompanionSource.Candidate,
    name,
    gender,
    age,
    identity,
    personalityKeywords,
    personality,
    speakingStyle,
    emotionalExpressions,
    originalFile
  }
}

/**
 * Extract the first match of a regex capture group from content.
 */
function extractSection(content: string, pattern: RegExp, groupIndex: number): string {
  const match = content.match(pattern)
  if (!match || !match[groupIndex]) {
    throw new Error(`Could not extract section with pattern ${pattern}`)
  }
  return match[groupIndex].trim()
}

/**
 * Extract the content of a section delimited by `## {sectionTitle}` until the next `## ` or end of file.
 */
function extractSectionContent(content: string, sectionTitle: string): string {
  const headingPattern = new RegExp(`^## ${escapeRegex(sectionTitle)}[^\\n]*\\n`, 'm')
  const match = content.match(headingPattern)
  if (!match) {
    throw new Error(`Section "## ${sectionTitle}" not found`)
  }
  const startIdx = (match.index ?? 0) + match[0].length

  // Find next ## heading after this section
  const rest = content.slice(startIdx)
  const nextHeading = rest.match(/^## /m)
  const endIdx = nextHeading
    ? startIdx + (nextHeading.index ?? 0)
    : content.length

  return content.slice(startIdx, endIdx).trim()
}

/**
 * Extract a field value from a basic info section.
 * Format: - **FieldName**：Value
 */
function extractField(section: string, fieldName: string): string {
  const pattern = new RegExp(`- \\*\\*${escapeRegex(fieldName)}\\*\\*[：:]\\s*(.+?)(?:\\n|$)`, 'm')
  const match = section.match(pattern)
  if (!match || !match[1]) {
    throw new Error(`Field "${fieldName}" not found in section:\n${section.slice(0, 200)}`)
  }
  return match[1].trim()
}

/**
 * Parse personality keywords.
 * Keywords may be separated by 、 or ，and may have an elaboration after ——.
 */
function parseKeywords(raw: string): string[] {
  // Strip elaboration after ——
  const dashIdx = raw.indexOf('——')
  const keywordPart = dashIdx >= 0 ? raw.slice(0, dashIdx) : raw

  // Split on Chinese enumeration comma or regular comma
  const parts = keywordPart.split(/[，、]/)
  const keywords = parts.map(k => k.trim()).filter(k => k.length > 0)

  if (keywords.length === 0) {
    throw new Error(`Could not parse keywords from "${raw}"`)
  }

  return keywords
}

/**
 * Build a deterministic companion ID from the file basename.
 * e.g., "alice.md" → "comp_alice"
 */
function fileToCompanionId(filename: string): CompanionId {
  const base = basename(filename, '.md')
  return `comp_${base}` as CompanionId
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Load all reference companions from the candidates directory.
 *
 * Reads every .md file, parses metadata, copies the markdown to companionDir,
 * and writes an index.json with structured companion data.
 */
export async function loadReferenceCompanions(
  options: LoadCompanionsOptions
): Promise<LoadCompanionsResult> {
  const { candidatesDir, companionDir } = options

  // Verify candidates directory exists
  await access(candidatesDir)

  // Ensure companion directory exists
  await mkdir(companionDir, { recursive: true })

  // Find all .md files
  const entries = await readdir(candidatesDir)
  const mdFiles = entries.filter(e => e.endsWith('.md'))

  const companions: Companion[] = []

  for (const filename of mdFiles) {
    const sourcePath = join(candidatesDir, filename)
    const destPath = join(companionDir, filename)
    const content = await readFile(sourcePath, 'utf-8')
    const id = fileToCompanionId(filename)

    const companion = parseCompanionMarkdown(content, id, filename)

    // Validate against schema
    const validated = CompanionSchema.safeParse(companion)
    if (!validated.success) {
      throw new Error(
        `Schema validation failed for ${filename}: ${JSON.stringify(validated.error.issues)}`
      )
    }

    companions.push(validated.data as Companion)

    // Copy markdown file to companion directory
    await copyFile(sourcePath, destPath)
  }

  // Write index.json with all companion metadata
  const indexPath = join(companionDir, 'index.json')
  await writeFile(indexPath, JSON.stringify(companions, null, 2), 'utf-8')

  return {
    companions,
    count: companions.length
  }
}
