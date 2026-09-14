import { useMemo } from 'react'
import { Streamdown, defaultRehypePlugins } from 'streamdown'
import { code } from '@streamdown/code'
import { createMathPlugin } from '@streamdown/math'
import { harden } from 'rehype-harden'

export interface MarkdownRendererProps {
  content: string
  /**
   * Rendering mode: `static` for persisted messages, `streaming` for the
   * in-flight assistant draft (handles incomplete Markdown gracefully).
   */
  mode?: 'static' | 'streaming'
}

/**
 * Securely renders Markdown, math, and code blocks without raw HTML execution.
 *
 * Security:
 * - `skipHtml` strips raw HTML from source, preventing XSS via markdown injection.
 * - `rehypePlugins` pipeline replaces the default rehype pipeline, preserving only
 *   `rehype-sanitize` and adding `rehype-harden` to block dangerous link protocols
 *   (`javascript:`, `data:`, `file:`, `vbscript:`).
 * - `harden` defaultOrigin is omitted (no relative URLs expected). Links are
 *   allowed for `https:`, `http:`, and `mailto:` protocols.
 *
 * Styling: dark academic theme using project Tailwind classes (no typography plugin).
 */
export function MarkdownRenderer({
  content,
  mode = 'static',
}: MarkdownRendererProps): React.ReactElement {
  const mathPlugin = useMemo(
    () => createMathPlugin({ singleDollarTextMath: true }),
    []
  )

  return (
    <div
      className="text-sm leading-7 text-gray-200 max-w-none
        [&_em]:text-gray-400 [&_em]:not-italic
        [&_pre]:bg-gray-900 [&_pre]:border [&_pre]:border-gray-700 [&_pre]:rounded-lg [&_pre]:p-4
        [&_code]:bg-gray-800 [&_code]:text-gray-200 [&_code]:px-1 [&_code]:rounded
        [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:rounded-none
        [&_blockquote]:border-l-4 [&_blockquote]:border-gray-600 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-gray-400
        [&_a]:text-blue-400 [&_a]:underline [&_a]:decoration-blue-500/50
        [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6
        [&_h1]:text-xl [&_h1]:font-bold [&_h1]:mb-2
        [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mb-1
        [&_h3]:text-base [&_h3]:font-medium [&_h3]:mb-1
        [&_p]:mb-2 [&_li]:mb-0.5"
    >
      <Streamdown
        mode={mode}
        plugins={{ code, math: mathPlugin }}
        skipHtml
        rehypePlugins={[
          defaultRehypePlugins.sanitize,
          [
            harden,
            {
              allowedLinkPrefixes: ['*'],
              allowedImagePrefixes: ['*'],
              allowedProtocols: ['https:', 'http:', 'mailto:'],
            },
          ],
        ]}
      >
        {content}
      </Streamdown>
    </div>
  )
}