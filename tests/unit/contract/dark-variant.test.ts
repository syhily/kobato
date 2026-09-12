import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// `src/styles/dark-variant.css` is the single source of kobato's class-or-media
// `dark` variant. Every Tailwind compilation whose `dark:` utilities must obey
// the site's theme class has to import it UNLAYERED and BEFORE the stylesheet
// that triggers the utility compile — otherwise that compilation falls back to
// Tailwind's default media-only variant, whose rules fire under a dark OS even
// when the site is class-locked to light (the ThemeToggle moon vanished on
// article pages exactly this way: the inkling comment-editor chunk compiled
// `dark:scale-0`/`dark:opacity-0` as bare `prefers-color-scheme` rules).

const STYLES = resolve(process.cwd(), 'src/styles')

const read = (name: string) => readFileSync(resolve(STYLES, name), 'utf8')

describe('dark variant contract', () => {
  it('single-sources the hybrid variant in dark-variant.css', () => {
    const partial = read('dark-variant.css')
    expect(partial).toContain('@custom-variant dark')
    expect(partial).toContain('&:where(.dark, .dark *)')
    expect(partial).toContain('@media (prefers-color-scheme: dark)')
    expect(partial).toContain('&:where(:root:not(.light, .dark), :root:not(.light, .dark) *)')
  })

  it('keeps exactly one @custom-variant dark definition across the style entries', () => {
    for (const name of ['tailwind.css', 'inkling-editor.css', 'inkling-comment-editor.css']) {
      expect(read(name)).not.toContain('@custom-variant dark')
    }
  })

  it('every Tailwind compilation importing the inkling package sheet registers the variant first', () => {
    for (const name of ['tailwind.css', 'inkling-editor.css', 'inkling-comment-editor.css']) {
      const css = read(name)
      expect(css).toContain("@import './dark-variant.css';")
      const variantAt = css.indexOf("@import './dark-variant.css';")
      const inklingAt = css.indexOf('@/inkling/styles/index.css')
      if (inklingAt !== -1) {
        expect(variantAt, `${name}: dark-variant import must precede the inkling sheet`).toBeLessThan(inklingAt)
      }
    }
  })

  it('the variant import is never wrapped in a cascade layer', () => {
    for (const name of ['tailwind.css', 'inkling-editor.css', 'inkling-comment-editor.css']) {
      expect(read(name)).not.toMatch(/@import\s+'\.\/dark-variant\.css'\s+layer\(/)
    }
  })
})
