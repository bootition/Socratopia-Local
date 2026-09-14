/** Shared result type for every format importer. */
export interface ParsedDocument {
  /** Full extracted text (Markdown-ish: headings become `## `). */
  text: string
  /** Per-page text when the format has pages (PDF), else null. */
  pages: string[] | null
  /** Page count when known, else null. */
  totalPages: number | null
  /** Document title from metadata, when available. */
  title?: string
}
