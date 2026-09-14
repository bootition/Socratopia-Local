/**
 * Tests for file importers (PDF / EPUB / DOCX / text) using real
 * fixture files under tests/fixtures/imports.
 */
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterAll, describe, expect, it } from 'vitest'

import AdmZip from 'adm-zip'
import { parseDocx } from '../../../src/main/textbooks/importers/docx-importer'
import {
  formatForExtension,
  parseImportFile
} from '../../../src/main/textbooks/importers/parse-file'
import { xhtmlToText } from '../../../src/main/textbooks/importers/epub-importer'

const FIXTURES = join(process.cwd(), 'tests', 'fixtures', 'imports')
const cleanupDirs: string[] = []

afterAll(async () => {
  await Promise.all(cleanupDirs.map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('formatForExtension', () => {
  it('maps supported extensions case-insensitively', () => {
    expect(formatForExtension('notes.MD')).toBe('markdown')
    expect(formatForExtension('book.pdf')).toBe('pdf')
    expect(formatForExtension('book.epub')).toBe('epub')
    expect(formatForExtension('handout.docx')).toBe('docx')
    expect(formatForExtension('plain.txt')).toBe('text')
  })

  it('returns null for unsupported extensions', () => {
    expect(formatForExtension('slides.ppt')).toBeNull()
    expect(formatForExtension('noextension')).toBeNull()
  })
})

describe('parseImportFile — text', () => {
  it('decodes UTF-8 text and strips a BOM', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'socratopia-import-'))
    cleanupDirs.push(dir)
    const file = join(dir, 'notes.md')
    await writeFile(file, '\uFEFF# 标题\n\n正文', 'utf-8')

    const parsed = await parseImportFile('notes.md', await readFile(file))
    expect(parsed.format).toBe('markdown')
    expect(parsed.document.text.startsWith('# 标题')).toBe(true)
  })

  it('rejects empty text files', async () => {
    await expect(parseImportFile('empty.txt', Buffer.from('   '))).rejects.toThrow(
      '文件内容为空'
    )
  })

  it('rejects unsupported extensions', async () => {
    await expect(parseImportFile('deck.pptx', Buffer.from('x'))).rejects.toThrow(
      '不支持的文件类型'
    )
  })

  it('rejects text beyond the character cap', async () => {
    const huge = 'a'.repeat(4_000_001)
    await expect(parseImportFile('huge.txt', Buffer.from(huge, 'utf-8'))).rejects.toThrow(
      '400 万字符上限'
    )
  })
})

describe('parseImportFile — PDF', () => {
  it('extracts per-page text and the page count', async () => {
    const buffer = await readFile(join(FIXTURES, 'sample.pdf'))
    const parsed = await parseImportFile('sample.pdf', buffer)

    expect(parsed.format).toBe('pdf')
    expect(parsed.document.totalPages).toBe(2)
    expect(parsed.document.pages).toHaveLength(2)
    expect(parsed.document.text).toContain('Inertia keeps motion')
    expect(parsed.document.text).toContain('Buoyancy pushes up')
    expect(parsed.document.text).toContain('## 第 2 页')
  })
})

describe('parseImportFile — EPUB', () => {
  it('extracts chapters in spine order with headings', async () => {
    const buffer = await readFile(join(FIXTURES, 'sample.epub'))
    const parsed = await parseImportFile('sample.epub', buffer)

    expect(parsed.format).toBe('epub')
    expect(parsed.title).toBe('Physics Primer')
    expect(parsed.document.text).toContain('# Chapter 1 Inertia')
    expect(parsed.document.text).toContain('An object keeps its state of rest')
    expect(parsed.document.text).toContain('# Chapter 2 Buoyancy')
    expect(parsed.document.text).toContain('Buoyancy equals the weight')
    expect(parsed.document.totalPages).toBeNull()
  })

  it('rejects a non-zip buffer', async () => {
    await expect(parseImportFile('broken.epub', Buffer.from('not a zip'))).rejects.toThrow(
      '无法读取 EPUB'
    )
  })
})

describe('parseImportFile — DOCX', () => {
  it('extracts the document text', async () => {
    const buffer = await readFile(join(FIXTURES, 'sample.docx'))
    const parsed = await parseImportFile('sample.docx', buffer)

    expect(parsed.format).toBe('docx')
    expect(parsed.document.text).toContain('Inertia is the tendency')
    expect(parsed.document.text).toContain('Passengers lean forward')
  })
})

describe('xhtmlToText', () => {
  it('converts headings, paragraphs, breaks and entities', () => {
    const text = xhtmlToText(
      '<html><head><title>x</title></head><body><h2>A &amp; B</h2><p>one<br/>two</p><p>&#20013;文</p></body></html>'
    )
    expect(text).toContain('## A & B')
    expect(text).toContain('one\ntwo')
    expect(text).toContain('中文')
    expect(text).not.toContain('<')
  })

  it('handles out-of-range entities and common named entities safely', () => {
    const text = xhtmlToText('<p>&#x110000; &mdash; &#0; &copy;</p>')
    expect(text).toContain('—')
    expect(text).toContain('©')
    expect(text).not.toContain('\u0000')
    expect(text).toContain('\uFFFD')
  })
})

// ---------------------------------------------------------------
// EPUB robustness regressions (red-team findings)
// ---------------------------------------------------------------

const EPUB_CONTAINER = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`

function buildEpub(options: {
  href: string
  filePath: string
  chapters?: Array<{ href: string; filePath: string; text: string }>
}): Buffer {
  const zip = new AdmZip()
  zip.addFile('mimetype', Buffer.from('application/epub+zip'))
  zip.addFile('META-INF/container.xml', Buffer.from(EPUB_CONTAINER))
  const chapters = options.chapters ?? [
    { href: options.href, filePath: options.filePath, text: 'Chapter body text.' }
  ]
  const manifest = chapters
    .map((chapter, index) => `<item id="c${index}" href="${chapter.href}" media-type="application/xhtml+xml"/>`)
    .join('')
  const spine = chapters.map((_chapter, index) => `<itemref idref="c${index}"/>`).join('')
  zip.addFile(
    'OEBPS/content.opf',
    Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Robust EPUB</dc:title></metadata>
  <manifest>${manifest}</manifest><spine>${spine}</spine>
</package>`)
  )
  for (const chapter of chapters) {
    zip.addFile(
      chapter.filePath,
      Buffer.from(`<html><body><h1>${chapter.text}</h1><p>${chapter.text}</p></body></html>`)
    )
  }
  return zip.toBuffer()
}

describe('parseImportFile — EPUB robustness', () => {
  it('imports an href containing a bare percent sign', async () => {
    const buffer = buildEpub({ href: '100%_notes.xhtml', filePath: 'OEBPS/100%_notes.xhtml' })
    const parsed = await parseImportFile('percent.epub', buffer)
    expect(parsed.document.text).toContain('Chapter body text')
  })

  it('imports an href with a fragment', async () => {
    const buffer = buildEpub({ href: 'ch1.xhtml#sec', filePath: 'OEBPS/ch1.xhtml' })
    const parsed = await parseImportFile('fragment.epub', buffer)
    expect(parsed.document.text).toContain('Chapter body text')
  })

  it('caps the cumulative extracted text instead of blowing up memory', async () => {
    const bigText = 'x'.repeat(1_200_000)
    const buffer = buildEpub({
      href: 'unused.xhtml',
      filePath: 'OEBPS/unused.xhtml',
      chapters: Array.from({ length: 5 }, (_value, index) => ({
        href: `c${index}.xhtml`,
        filePath: `OEBPS/c${index}.xhtml`,
        text: bigText
      }))
    })

    const parsed = await parseImportFile('bomb.epub', buffer)
    expect(parsed.document.text.length).toBeLessThan(4_200_000)
    expect(parsed.document.text).toContain('内容过长')
  })
})

describe('parseDocx — decompression guard', () => {
  it('rejects a package whose declared expanded size exceeds the cap', async () => {
    const zip = new AdmZip()
    zip.addFile('word/document.xml', Buffer.from('<w:t>hello</w:t>'))
    const buffer = zip.toBuffer()

    await expect(
      parseDocx(buffer, { maxTotalUncompressedBytes: 8 })
    ).rejects.toThrow('解压后过大')
  })

  it('parses a normal docx package', async () => {
    const buffer = await readFile(
      join(process.cwd(), 'tests', 'fixtures', 'imports', 'sample.docx')
    )
    const parsed = await parseDocx(buffer)
    expect(parsed.text.length).toBeGreaterThan(0)
  })
})

describe('plain-text encoding detection', () => {
  it('decodes GB18030 files instead of producing replacement characters', async () => {
    // "你好世界" in GB18030
    const gbk = Buffer.from([0xc4, 0xe3, 0xba, 0xc3, 0xca, 0xc0, 0xbd, 0xe7])
    const parsed = await parseImportFile('legacy.txt', gbk)
    expect(parsed.document.text).toBe('你好世界')
  })

  it('decodes UTF-16LE files with a BOM', async () => {
    const utf16 = Buffer.concat([
      Buffer.from([0xff, 0xfe]),
      Buffer.from('你好', 'utf16le')
    ])
    const parsed = await parseImportFile('utf16.txt', utf16)
    expect(parsed.document.text).toBe('你好')
  })
})
