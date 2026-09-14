/**
 * Renderer CSP / shell document checks.
 *
 * The Markdown renderer allows https images (rehype-harden), so the
 * document CSP must not silently block them; scripts stay locked to
 * 'self' and eval is never allowed.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const html = readFileSync(
  join(process.cwd(), 'src', 'renderer', 'index.html'),
  'utf-8'
)

describe('renderer document', () => {
  it('locks scripts to self', () => {
    expect(html).toContain("default-src 'self'")
    expect(html).toContain("script-src 'self'")
    expect(html).not.toContain('unsafe-eval')
    expect(html).not.toMatch(/script-src[^;]*unsafe-inline/)
  })

  it('allows the fonts and images the UI needs', () => {
    expect(html).toContain("font-src 'self' data:")
    expect(html).toContain("img-src 'self' data: https:")
  })

  it('exposes the React root and the module entry', () => {
    expect(html).toContain('<div id="root"></div>')
    expect(html).toContain('src="./src/main.tsx"')
    expect(html).toContain('<title>Socratopia-Local</title>')
  })
})
