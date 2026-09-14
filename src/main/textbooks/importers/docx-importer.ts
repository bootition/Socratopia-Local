/**
 * DOCX text extraction (F28) via mammoth.
 *
 * Only the raw text matters for teaching; formatting/tables beyond text
 * are intentionally dropped.
 *
 * Before handing the buffer to mammoth/jszip, the zip directory is
 * inspected so a decompression bomb cannot expand inside the main
 * process (the 100MB input cap alone does not bound the expanded size).
 */

import AdmZip from 'adm-zip'
import * as mammoth from 'mammoth'
import type { ParsedDocument } from './types'

/** Total declared uncompressed size cap for a docx package. */
const MAX_TOTAL_UNCOMPRESSED_BYTES = 200 * 1024 * 1024
/** Refuse pathological package structures early. */
const MAX_ENTRIES = 5000

export interface ParseDocxOptions {
  /** Override for tests; production uses the module default. */
  maxTotalUncompressedBytes?: number
}

export async function parseDocx(
  buffer: Buffer,
  options: ParseDocxOptions = {}
): Promise<ParsedDocument> {
  const maxTotal =
    options.maxTotalUncompressedBytes ?? MAX_TOTAL_UNCOMPRESSED_BYTES

  let zip: AdmZip
  try {
    zip = new AdmZip(buffer)
  } catch {
    throw new Error('无法读取 Word 文件（不是有效的 .docx / zip 容器）')
  }

  const entries = zip.getEntries()
  if (entries.length > MAX_ENTRIES) {
    throw new Error('Word 文件结构异常（条目过多），已拒绝导入')
  }

  let totalUncompressed = 0
  for (const entry of entries) {
    totalUncompressed += entry.header.size
    if (totalUncompressed > maxTotal) {
      throw new Error('Word 文档解压后过大（超过 200MB），已拒绝导入')
    }
  }

  const result = await mammoth.extractRawText({ buffer })
  const text = result.value.trim()
  if (text.length === 0) {
    throw new Error('Word 文档中没有可提取的文字（可能是纯图片或扫描件）')
  }
  return { text, pages: null, totalPages: null }
}
