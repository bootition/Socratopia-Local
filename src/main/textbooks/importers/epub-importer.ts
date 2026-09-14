/**
 * EPUB text extraction (F27/F29) with adm-zip + a small XHTML-to-text
 * converter. No extra HTML dependency: headings become Markdown `##`,
 * paragraphs/line breaks become newlines.
 *
 * Safety limits:
 * - each zip entry is size-checked before decompression (zip bombs)
 * - the cumulative extracted text is capped while reading chapters
 * - undecodable percent-escapes fall back to the raw href
 * - skipped chapters are reported instead of silently disappearing
 */

import AdmZip from 'adm-zip'
import { posix } from 'node:path'
import type { ParsedDocument } from './types'

/** Per-entry decompressed size cap (guards against zip bombs). */
const MAX_ENTRY_BYTES = 20 * 1024 * 1024
/** Cumulative extracted-text cap, shared with the import router. */
const MAX_IMPORT_CHARS = 4_000_000
/** Refuse absurd spines instead of looping forever. */
const MAX_SPINE_ITEMS = 2000

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  copy: '©',
  reg: '®',
  trade: '™',
  laquo: '«',
  raquo: '»',
  ldquo: '“',
  rdquo: '”',
  lsquo: '‘',
  rsquo: '’',
  middot: '·',
  bull: '•',
  deg: '°',
  plusmn: '±',
  times: '×',
  divide: '÷',
  frac12: '½'
}

function decodeCodePoint(value: number): string {
  // Reject surrogates, NUL and out-of-range code points instead of
  // throwing (String.fromCodePoint) or emitting control characters.
  if (!Number.isFinite(value) || value <= 0 || value > 0x10ffff) return '\uFFFD'
  if (value >= 0xd800 && value <= 0xdfff) return '\uFFFD'
  return String.fromCodePoint(value)
}

function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) =>
      decodeCodePoint(Number.parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_match, dec: string) =>
      decodeCodePoint(Number.parseInt(dec, 10))
    )
    .replace(/&([a-z][a-z0-9]*);/gi, (match, name: string) =>
      NAMED_ENTITIES[name.toLowerCase()] ?? match
    )
}

/** Percent-decode a zip path without ever throwing. */
function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
}

/** Convert one XHTML chapter into Markdown-ish plain text. */
export function xhtmlToText(xhtml: string): string {
  const withoutHead = xhtml
    .replace(/<\?xml[\s\S]*?\?>/gi, '')
    .replace(/<!DOCTYPE[\s\S]*?>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<head[\s\S]*?<\/head>/gi, '')

  const withHeadings = withoutHead.replace(
    /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi,
    (_match, level: string, inner: string) =>
      `\n\n${'#'.repeat(Number(level))} ${stripTags(inner)}\n\n`
  )

  const withBreaks = withHeadings
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|section|article|blockquote|td)>/gi, '\n\n')

  return decodeEntities(withBreaks.replace(/<[^>]+>/g, ''))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

interface ManifestItem {
  id: string
  href: string
  mediaType: string
}

function readEntryText(zip: AdmZip, path: string): string | null {
  const entry = zip.getEntry(path)
  if (entry === null) return null
  if (entry.header.size > MAX_ENTRY_BYTES) return null
  const data = entry.getData()
  if (data.length > MAX_ENTRY_BYTES) return null
  return data.toString('utf-8')
}

export async function parseEpub(buffer: Buffer): Promise<ParsedDocument> {
  let zip: AdmZip
  try {
    zip = new AdmZip(buffer)
  } catch {
    throw new Error('无法读取 EPUB 文件（不是有效的 zip 容器）')
  }

  const containerXml = readEntryText(zip, 'META-INF/container.xml')
  if (containerXml === null) {
    throw new Error('EPUB 缺少 META-INF/container.xml')
  }
  const rootMatch = containerXml.match(/full-path="([^"]+)"/)
  if (rootMatch === null) {
    throw new Error('EPUB container.xml 中没有 rootfile')
  }

  const opfPath = safeDecode(rootMatch[1])
  const opf = readEntryText(zip, opfPath)
  if (opf === null) {
    throw new Error('EPUB 中找不到 OPF 包文件')
  }
  const opfDir = posix.dirname(opfPath)

  const manifest = new Map<string, ManifestItem>()
  for (const match of opf.matchAll(/<item\b[^>]*>/gi)) {
    const tag = match[0]
    const id = tag.match(/id="([^"]+)"/)?.[1]
    const href = tag.match(/href="([^"]+)"/)?.[1]
    const mediaType = tag.match(/media-type="([^"]+)"/)?.[1] ?? ''
    if (id !== undefined && href !== undefined) {
      manifest.set(id, { id, href, mediaType })
    }
  }

  const spineIds = [...opf.matchAll(/<itemref\b[^>]*idref="([^"]+)"/gi)]
    .map((match) => match[1])
    .slice(0, MAX_SPINE_ITEMS)
  if (spineIds.length === 0) {
    throw new Error('EPUB spine 为空，无法确定阅读顺序')
  }

  const chapters: string[] = []
  let totalChars = 0
  let skipped = 0
  let truncated = false

  for (const id of spineIds) {
    const item = manifest.get(id)
    if (item === undefined) {
      skipped += 1
      continue
    }

    // Drop URI fragments: `chapter1.xhtml#sec` refers to the same entry.
    const href = safeDecode(item.href.split('#')[0])
    const entryPath = posix.normalize(posix.join(opfDir, href))
    const text = readEntryText(zip, entryPath)
    if (text === null) {
      skipped += 1
      continue
    }

    const chapter = xhtmlToText(text)
    if (chapter.length === 0) {
      skipped += 1
      continue
    }

    totalChars += chapter.length
    if (totalChars > MAX_IMPORT_CHARS) {
      truncated = true
      break
    }
    chapters.push(chapter)
  }

  if (chapters.length === 0) {
    throw new Error(
      skipped > 0
        ? `EPUB 中没有可提取的文字（${skipped} 个章节被跳过：文件缺失、过大或为空）`
        : 'EPUB 中没有可提取的文字'
    )
  }

  const notes: string[] = []
  if (skipped > 0) notes.push(`导入时跳过 ${skipped} 个章节（缺失/过大/为空）`)
  if (truncated) notes.push(`内容过长，已导入前 ${chapters.length} 章`)

  const text = [chapters.join('\n\n'), ...notes.map((note) => `> （${note}）`)]
    .filter((part) => part.length > 0)
    .join('\n\n')

  const title = opf.match(/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/i)?.[1]

  return {
    text,
    pages: null,
    totalPages: null,
    ...(title !== undefined ? { title: stripTags(title) } : {})
  }
}
