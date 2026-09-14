/**
 * File-import router (F28/F29): maps an extension to an importer and
 * returns a normalized document ready for the textbook store.
 */

import { extname } from 'node:path'
import type { TextbookFormat } from '../../../shared/types/ids'
import { TextbookFormat as Format } from '../../../shared/types/ids'
import { parseDocx } from './docx-importer'
import { parseEpub } from './epub-importer'
import { parsePdf } from './pdf-importer'
import type { ParsedDocument } from './types'

export interface ParsedImport {
  format: TextbookFormat
  /** Title from document metadata, when available. */
  title: string | null
  document: ParsedDocument
}

const EXTENSION_FORMAT: Record<string, TextbookFormat> = {
  '.md': Format.Markdown,
  '.markdown': Format.Markdown,
  '.txt': Format.Text,
  '.pdf': Format.Pdf,
  '.epub': Format.Epub,
  '.docx': Format.Docx
}

/** Supported extension → textbook format, or null when unsupported. */
export function formatForExtension(fileName: string): TextbookFormat | null {
  return EXTENSION_FORMAT[extname(fileName).toLowerCase()] ?? null
}

/** Import limits: keep a runaway file from exhausting memory. */
export const MAX_IMPORT_BYTES = 100 * 1024 * 1024
export const MAX_IMPORT_CHARS = 4_000_000

function assertWithinLimits(buffer: Buffer, text: string): void {
  if (buffer.length > MAX_IMPORT_BYTES) {
    throw new Error('文件过大（上限 100MB）')
  }
  if (text.length > MAX_IMPORT_CHARS) {
    throw new Error('提取出的文字超过 400 万字符上限，请拆分后再导入')
  }
}

/**
 * Decode a plain-text file.
 *
 * UTF-16 BOMs are honoured; otherwise strict UTF-8 is tried first and a
 * GB18030 fallback catches legacy Chinese files. Without the fallback a
 * GBK file was silently imported as a string full of U+FFFD.
 */
function decodePlainText(buffer: Buffer): string {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(buffer.subarray(2))
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(buffer.subarray(2))
  }

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    return new TextDecoder('gb18030').decode(buffer)
  }
}

/** Parse an imported file into plain text (+ pages for PDF). */
export async function parseImportFile(
  fileName: string,
  buffer: Buffer
): Promise<ParsedImport> {
  const format = formatForExtension(fileName)
  if (format === null) {
    throw new Error('不支持的文件类型（支持 .md / .txt / .pdf / .epub / .docx）')
  }
  if (buffer.length > MAX_IMPORT_BYTES) {
    throw new Error('文件过大（上限 100MB）')
  }

  switch (format) {
    case Format.Markdown:
    case Format.Text: {
      const text = decodePlainText(buffer).replace(/^\uFEFF/, '').trim()
      if (text.length === 0) throw new Error('文件内容为空')
      assertWithinLimits(buffer, text)
      return { format, title: null, document: { text, pages: null, totalPages: null } }
    }
    case Format.Pdf: {
      const document = await parsePdf(buffer)
      assertWithinLimits(buffer, document.text)
      return { format, title: document.title ?? null, document }
    }
    case Format.Epub: {
      const document = await parseEpub(buffer)
      assertWithinLimits(buffer, document.text)
      return { format, title: document.title ?? null, document }
    }
    case Format.Docx: {
      const document = await parseDocx(buffer)
      assertWithinLimits(buffer, document.text)
      return { format, title: document.title ?? null, document }
    }
  }
}
