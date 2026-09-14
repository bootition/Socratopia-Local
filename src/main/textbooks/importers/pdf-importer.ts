/**
 * PDF text extraction (F29) using pdfjs-dist's legacy build.
 *
 * Runs in the Electron main process (no DOM): text extraction does not
 * need a canvas. Scanned/image-only PDFs yield little or no text — the
 * caller surfaces that as a clear error instead of an empty textbook.
 */

import type { ParsedDocument } from './types'

/** Import caps: keep a huge PDF from exhausting main-process memory. */
const MAX_IMPORT_PAGES = 2000
const MAX_IMPORT_CHARS = 4_000_000

interface PdfTextItem {
  str?: string
}

interface PdfPage {
  getTextContent(): Promise<{ items: PdfTextItem[] }>
  cleanup?(): void
}

interface PdfDocument {
  numPages: number
  getPage(pageNumber: number): Promise<PdfPage>
}

interface PdfLoadingTask {
  promise: Promise<PdfDocument>
  destroy(): Promise<void>
}

interface PdfJsModule {
  getDocument(options: {
    data: Uint8Array
    isEvalSupported?: boolean
    useWorkerFetch?: boolean
    disableFontFace?: boolean
  }): PdfLoadingTask
}

export async function parsePdf(buffer: Buffer): Promise<ParsedDocument> {
  let pdfjs: PdfJsModule
  try {
    pdfjs = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as PdfJsModule
  } catch {
    throw new Error('PDF 解析组件加载失败（打包缺少 pdfjs 资源，请重新安装应用）')
  }

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
    useWorkerFetch: false,
    disableFontFace: true
  })

  let document: PdfDocument
  try {
    document = await loadingTask.promise
  } catch (err: unknown) {
    // Password-protected/corrupt PDFs must not leak the loading task.
    await loadingTask.destroy().catch(() => undefined)
    throw new Error(
      err instanceof Error && err.message.length > 0
        ? `无法读取 PDF：${err.message}`
        : '无法读取 PDF（文件可能已损坏或受密码保护）'
    )
  }
  const totalPages = document.numPages

  try {
    const pages: string[] = []
    let totalChars = 0
    let truncated = false

    for (let pageNumber = 1; pageNumber <= totalPages; pageNumber++) {
      const page = await document.getPage(pageNumber)
      const content = await page.getTextContent()
      const text = content.items
        .map((item) => item.str ?? '')
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()

      totalChars += text.length
      if (totalChars > MAX_IMPORT_CHARS) {
        truncated = true
        break
      }

      pages.push(text)
      page.cleanup?.()

      if (pages.length >= MAX_IMPORT_PAGES) {
        truncated = true
        break
      }
    }

    const meaningful = pages.filter((text) => text.length > 0)
    if (meaningful.length === 0) {
      throw new Error('PDF 中没有可提取的文字（可能是扫描件，暂不支持 OCR）')
    }

    const body = pages
      .map((pageText, index) => `## 第 ${index + 1} 页\n\n${pageText}`)
      .join('\n\n')
    const text = truncated
      ? `${body}\n\n> （文档较大，已导入前 ${pages.length} 页 / 共 ${totalPages} 页）`
      : body

    return { text, pages, totalPages }
  } finally {
    await loadingTask.destroy()
  }
}
