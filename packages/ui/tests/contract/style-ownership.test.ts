import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const STYLES = resolve(process.cwd(), 'packages/ui/src/styles')

describe('UI style ownership', () => {
  it('contains only generic design-system partials', () => {
    expect(
      readdirSync(STYLES)
        .filter((name) => name.endsWith('.css'))
        .sort(),
    ).toEqual(['dark-variant.css', 'tailwind.css', 'typeset.css', 'ui.css'])
  })

  it('never scans or imports product-layer sources', () => {
    for (const name of readdirSync(STYLES).filter((entry) => entry.endsWith('.css'))) {
      const source = readFileSync(resolve(STYLES, name), 'utf8')
      expect(source).not.toContain('@kobato/web/')
      expect(source).not.toMatch(/@source[^;]*(?:apps|packages\/web|packages\/shared)/)
    }
  })
})
