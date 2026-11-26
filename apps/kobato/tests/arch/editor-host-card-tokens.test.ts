import { KOBATO_HOST_CARD_NODE_TYPES } from '@kobato/inkling/headless/node-whitelist'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const editorCss = readFileSync(resolve(process.cwd(), 'apps/kobato/src/ui/styles/inkling-editor.css'), 'utf8')
const inklingCss = readFileSync(resolve(process.cwd(), 'packages/inkling/src/styles/index.css'), 'utf8')
const tailwindCss = readFileSync(resolve(process.cwd(), 'packages/ui/src/styles/tailwind.css'), 'utf8')

const restoreRule = /\.kobato-page-editor\s+\[data-inkling-card='[^']+'\][^{]*\{([^}]*)\}/.exec(editorCss)

const TAILWIND_DEFAULT_TEXT_SCALE: Record<string, string> = {
  xs: '0.75rem',
  sm: '0.875rem',
  lg: '1.125rem',
  xl: '1.25rem',
  '3xl': '1.875rem',
  '4xl': '2.25rem',
  '5xl': '3rem',
  '6xl': '3.75rem',
  '7xl': '4.5rem',
  '8xl': '6rem',
  '9xl': '8rem',
}

const INKLING_ONLY_TOKENS = new Set(['--text-2xs'])

function kobatoTextValue(token: string): string {
  const name = token.replace(/^--text-/, '')
  const override = new RegExp(`${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s*([^;]+);`).exec(tailwindCss)
  if (override) {
    return override[1].trim()
  }
  const lineHeight = /^(.+)--line-height$/.exec(name)
  if (lineHeight) {
    return '1'
  }
  const value = TAILWIND_DEFAULT_TEXT_SCALE[name]
  if (!value) {
    throw new Error(`No expected kobato value for ${token} — extend the pin table`)
  }
  return value
}

describe('host-card text-scale restore contract', () => {
  it('the restore rule exists and covers every host card type', () => {
    expect(restoreRule, 'restore rule missing from src/styles/inkling-editor.css').not.toBeNull()
    const selector = /(\.kobato-page-editor\s+\[data-inkling-card[^{]+)\{/.exec(editorCss)![1]
    for (const type of KOBATO_HOST_CARD_NODE_TYPES) {
      expect(selector).toContain(`[data-inkling-card='${type}']`)
    }
  })

  it('every text token inkling shadows on .inkling-lexical is restored with the kobato value', () => {
    const scope = /\.inkling-lexical\s*\{([\s\S]*)\}\s*\}/.exec(inklingCss)
    expect(scope, 'inkling scoped theme block not found').not.toBeNull()
    const shadowed = [...scope![1].matchAll(/(--text-[a-z0-9-]+)\s*:/gi)].map((m) => m[1])
    expect(shadowed.length).toBeGreaterThan(0)
    for (const token of new Set(shadowed)) {
      if (INKLING_ONLY_TOKENS.has(token)) {
        continue
      }
      const declaration = new RegExp(`${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s*([^;]+);`).exec(
        restoreRule![1],
      )
      expect(declaration, `${token} is shadowed by inkling but not restored on host cards`).not.toBeNull()
      expect(declaration![1].trim()).toBe(kobatoTextValue(token))
    }
  })
})
