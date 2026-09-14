import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import type React from 'react'
import { toUserMessage } from '../lib/user-message'
import { useClassroom } from '../context/ClassroomContext'
import type { Textbook } from '../../../shared/schemas/textbook'
import { TextbookPreview } from './TextbookPreview'

/** Formats this importer can write. PDF/EPUB are out of scope for Milestone 3. */
export type TextbookImportFormat = 'markdown' | 'text'

interface FieldErrors {
  title?: string
  content?: string
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    // Browser-only FileReader: the renderer never sends a local file path
    // (or the File object) to the main process, only the decoded text.
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
      } else {
        reject(new Error('无法按 UTF-8 文本读取该文件。'))
      }
    }
    reader.onerror = () => {
      reject(reader.error ?? new Error('无法读取该文件。'))
    }
    reader.readAsText(file)
  })
}

function detectFormat(fileName: string): TextbookImportFormat | null {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.md')) return 'markdown'
  if (lower.endsWith('.txt')) return 'text'
  return null
}

function deriveTitle(fileName: string): string {
  const base = fileName.replace(/\.(md|txt)$/i, '').trim()
  return base.length > 0 ? base : '未命名教材'
}

const INPUT_CLASSES =
  'w-full rounded-md border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-2 focus:outline-offset-1 focus:outline-[var(--primary)]'

const PRIMARY_BUTTON_CLASSES =
  'inline-flex items-center justify-center rounded-md bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-60'

const ERROR_TEXT_CLASSES = 'text-sm text-red-600 dark:text-red-400'

/**
 * Textbook import UI: paste Markdown/plain text or pick a local `.md`/`.txt`
 * file, then save it through `window.socratopia.textbooks.createFromText`.
 *
 * Must be rendered inside `ClassroomProvider`: on a successful save the new
 * textbook id is written back to `ClassroomContext` via `setTextbookId` so the
 * rest of the classroom can react to the selection.
 */
export interface TextbookImporterProps {
  /** Notified after a successful import so sibling views can refresh. */
  onImported?: (textbook: Textbook) => void
  /** Jump to the classroom right after a successful import. */
  onGoToClassroom?: () => void
}

export function TextbookImporter({
  onImported,
  onGoToClassroom
}: TextbookImporterProps = {}): React.ReactElement {
  const { setTextbookId } = useClassroom()

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [format, setFormat] = useState<TextbookImportFormat>('markdown')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saved, setSaved] = useState<Textbook | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function clearFieldError(field: keyof FieldErrors): void {
    setFieldErrors((current) => {
      if (current[field] === undefined) return current
      const next = { ...current }
      delete next[field]
      return next
    })
  }

  function resetToForm(): void {
    setTitle('')
    setContent('')
    setFormat('markdown')
    setFieldErrors({})
    setError(null)
    setIsSaving(false)
    setSaved(null)
    if (fileInputRef.current !== null) {
      fileInputRef.current.value = ''
    }
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const input = event.currentTarget
    const file = input.files?.[0] ?? null
    // Clear the input so choosing the same file again still fires `change`.
    input.value = ''
    if (file === null) return

    const detected = detectFormat(file.name)
    if (detected === null) {
      setError('不支持的文件类型：请选择 .md / .txt，或用「选择文件导入」按钮导入 PDF / EPUB / Word。')
      return
    }

    if (file.size > 100 * 1024 * 1024) {
      setError('文件太大（上限 100 MB）。')
      return
    }

    setError(null)
    try {
      const text = await readFileAsText(file)
      if (text.length > 4_000_000) {
        setError('文本超过 400 万字符上限，请拆分后再导入。')
        return
      }
      setContent(text)
      setFormat(detected)
      setTitle((current) =>
        current.trim().length === 0 ? deriveTitle(file.name) : current
      )
      clearFieldError('content')
    } catch {
      setError('无法读取该文件，请确认是 UTF-8 编码的 .md / .txt 文本。')
    }
  }

  async function handleImportFile(): Promise<void> {
    setIsSaving(true)
    setError(null)
    try {
      const textbook = await window.socratopia.textbooks.importFile()
      if (textbook === null) return // dialog cancelled
      setTextbookId(textbook.id)
      setSaved(textbook)
      onImported?.(textbook)
    } catch (cause) {
      setError(toUserMessage(cause, '导入文件失败'))
    } finally {
      setIsSaving(false)
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()

    const trimmedTitle = title.trim()
    const nextErrors: FieldErrors = {}
    if (trimmedTitle.length === 0) nextErrors.title = '请填写教材标题。'
    if (content.trim().length === 0) nextErrors.content = '内容不能为空。'
    setFieldErrors(nextErrors)
    if (content.length > 4_000_000) {
      nextErrors.content = '内容超过 400 万字符上限，请拆分后再导入。'
    }
    setFieldErrors(nextErrors)
    if (nextErrors.title !== undefined || nextErrors.content !== undefined) {
      return
    }

    setIsSaving(true)
    setError(null)
    try {
      const textbook = await window.socratopia.textbooks.createFromText({
        title: trimmedTitle,
        format,
        content
      })
      setTextbookId(textbook.id)
      setSaved(textbook)
      onImported?.(textbook)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Unknown error.'
      setError(`Could not save textbook: ${message}`)
    } finally {
      setIsSaving(false)
    }
  }

  if (saved !== null) {
    return (
      <TextbookPreview
        textbook={saved}
        onReimport={resetToForm}
        {...(onGoToClassroom !== undefined ? { onGoToClassroom } : {})}
      />
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      aria-label="Import textbook"
      className="space-y-5 rounded-lg border border-[var(--border)] bg-[var(--card)] p-5 text-[var(--card-foreground)]"
    >
      <div>
        <h2 className="text-lg font-semibold">Import textbook</h2>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          Paste Markdown or plain text, or choose a local .md/.txt file. File text is
          read in this window and saved through the classroom store.
        </p>
      </div>

      {error !== null && (
        <p
          role="alert"
          className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400"
        >
          {error}
        </p>
      )}

      <div className="space-y-1">
        <label htmlFor="textbook-title" className="block text-sm font-medium">
          Textbook title
        </label>
        <input
          id="textbook-title"
          type="text"
          value={title}
          onChange={(event) => {
            setTitle(event.target.value)
            clearFieldError('title')
          }}
          aria-invalid={fieldErrors.title !== undefined}
          aria-describedby={fieldErrors.title !== undefined ? 'textbook-title-error' : undefined}
          placeholder="e.g. Introduction to Logic"
          className={INPUT_CLASSES}
        />
        {fieldErrors.title !== undefined && (
          <p id="textbook-title-error" role="alert" className={ERROR_TEXT_CLASSES}>
            {fieldErrors.title}
          </p>
        )}
      </div>

      <div className="space-y-1">
        <label htmlFor="textbook-content" className="block text-sm font-medium">
          Content
        </label>
        <textarea
          id="textbook-content"
          value={content}
          onChange={(event) => {
            setContent(event.target.value)
            clearFieldError('content')
          }}
          rows={10}
          aria-invalid={fieldErrors.content !== undefined}
          aria-describedby={
            fieldErrors.content !== undefined ? 'textbook-content-error' : undefined
          }
          placeholder="Paste Markdown or plain text here"
          className={`${INPUT_CLASSES} resize-y font-mono`}
        />
        {fieldErrors.content !== undefined && (
          <p id="textbook-content-error" role="alert" className={ERROR_TEXT_CLASSES}>
            {fieldErrors.content}
          </p>
        )}
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Format</legend>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="textbook-format"
              value="markdown"
              checked={format === 'markdown'}
              onChange={() => setFormat('markdown')}
              className="accent-[var(--primary)]"
            />
            Markdown
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="textbook-format"
              value="text"
              checked={format === 'text'}
              onChange={() => setFormat('text')}
              className="accent-[var(--primary)]"
            />
            Plain text
          </label>
        </div>
      </fieldset>

      <div className="space-y-1">
        <label htmlFor="textbook-file" className="block text-sm font-medium">
          Upload a .md or .txt file
        </label>
        <input
          id="textbook-file"
          ref={fileInputRef}
          type="file"
          accept=".md,.txt,text/markdown,text/plain"
          onChange={handleFileChange}
          className="block w-full cursor-pointer rounded-md border border-[var(--border)] bg-[var(--background)] p-2 text-sm text-[var(--muted-foreground)] file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-[var(--muted)] file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-[var(--foreground)]"
        />
      </div>

      <div className="space-y-1 rounded-md border border-[var(--border)] bg-[var(--background)] p-3">
        <p className="text-sm font-medium">从文件导入 PDF / EPUB / Word / Markdown</p>
        <p className="text-xs text-[var(--muted-foreground)]">
          在系统文件对话框里选择文件，主进程负责解析并保留原始文件；扫描版 PDF 需要 OCR，暂不支持。
        </p>
        <button
          type="button"
          onClick={() => void handleImportFile()}
          disabled={isSaving}
          className="mt-2 rounded-md border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--muted)] disabled:opacity-50"
        >
          选择文件导入…
        </button>
      </div>

      <button type="submit" disabled={isSaving} className={PRIMARY_BUTTON_CLASSES}>
        {isSaving ? '正在保存…' : '保存教材'}
      </button>
    </form>
  )
}
