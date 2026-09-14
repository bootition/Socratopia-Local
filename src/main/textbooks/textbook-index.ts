/**
 * Textbook segmentation for grounded teaching (F02).
 *
 * Splits Markdown/plain text into paragraph-level segments with stable
 * ids and human-readable anchors. No invented page numbers: anchors use
 * the current heading plus the paragraph ordinal, so a citation can
 * always be checked against the original file.
 */

export interface TextbookSegment {
  /** Stable id used in prompts and citations, e.g. `seg_3` */
  segmentId: string
  /** 1-based ordinal inside the textbook */
  index: number
  /** Nearest heading above this segment ('' when none) */
  heading: string
  /** Verbatim paragraph text */
  text: string
  /** Human-readable anchor shown in the source panel */
  label: string
}

const HEADING_PATTERN = /^(#{1,6})\s+(.+?)\s*$/

const MAX_SEGMENTS = 2000

/**
 * Split textbook content into segments.
 *
 * - Markdown headings (`#`) start a new section and become the anchor.
 * - Blocks are separated by blank lines.
 * - Very short fragments (single characters) are merged into the
 *   previous segment so citations stay meaningful.
 */
export function segmentTextbook(content: string): TextbookSegment[] {
  const blocks = content.replace(/\r\n/g, '\n').split(/\n{2,}/)

  const segments: TextbookSegment[] = []
  let heading = ''
  let paragraphInSection = 0

  for (const rawBlock of blocks) {
    const block = rawBlock.trim()
    if (block.length === 0) continue

    const headingMatch = block.match(HEADING_PATTERN)
    if (headingMatch !== null) {
      heading = headingMatch[2].trim()
      paragraphInSection = 0
      continue
    }

    // Merge tiny fragments (e.g. a stray list dash) into the previous one.
    if (block.length <= 2 && segments.length > 0) {
      const previous = segments[segments.length - 1]
      previous.text = `${previous.text} ${block}`.trim()
      continue
    }

    paragraphInSection += 1
    const index = segments.length + 1
    const label =
      heading.length > 0
        ? `${heading} · 第 ${paragraphInSection} 段`
        : `第 ${index} 段`

    segments.push({
      segmentId: `seg_${index}`,
      index,
      heading,
      text: block,
      label
    })

    if (segments.length >= MAX_SEGMENTS) break
  }

  return segments
}
