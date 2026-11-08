import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { DEFAULT_FONT_STACKS } from '@/shared/config/font-stacks'
import { SUPPORTED_LOCALES } from '@/shared/i18n/locales'

// Plan 001, 5c: the locale default font chains exist twice by necessity —
// once in CSS (`:lang()` branches in tailwind.css) and once in the shared map
// root.tsx prepends custom families to. This contract keeps them identical.

const CSS = readFileSync('src/styles/tailwind.css', 'utf8')
const ROOT = readFileSync('src/root.tsx', 'utf8')

function normalize(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*/g, ', ')
    .trim()
}

function cssVariable(block: string, name: string): string {
  const match = new RegExp(`--${name}:\\s*([^;]+);`).exec(block)
  if (match === null) {
    throw new Error(`missing --${name} in CSS block`)
  }
  return normalize(match[1] ?? '')
}

function langBlock(locale: string): string {
  const match = new RegExp(`:lang\\(${locale}\\)\\s*\\{([\\s\\S]*?)\\}`).exec(CSS)
  if (match === null) {
    throw new Error(`missing :lang(${locale}) block`)
  }
  return match[1] ?? ''
}

function rootBlock(): string {
  for (const match of CSS.matchAll(/:root\s*\{([\s\S]*?)\}/g)) {
    const block = match[1] ?? ''
    if (block.includes('--font-body:')) {
      return block
    }
  }
  throw new Error('missing :root font block')
}

describe('locale font stacks — CSS ⇔ shared map contract', () => {
  it('defines a stack for every supported locale', () => {
    expect(Object.keys(DEFAULT_FONT_STACKS).sort()).toEqual([...SUPPORTED_LOCALES].sort())
  })

  it('applies the zh-CN chain on :root (the document default)', () => {
    const root = rootBlock()
    expect(cssVariable(root, 'font-body')).toBe(normalize(DEFAULT_FONT_STACKS['zh-CN'].body))
    expect(cssVariable(root, 'font-serif')).toBe(normalize(DEFAULT_FONT_STACKS['zh-CN'].serif))
  })

  it.each(['en-US', 'zh-TW', 'zh-HK'] as const)('branches %s through :lang()', (locale) => {
    const block = langBlock(locale)
    expect(cssVariable(block, 'font-body')).toBe(normalize(DEFAULT_FONT_STACKS[locale].body))
    expect(cssVariable(block, 'font-serif')).toBe(normalize(DEFAULT_FONT_STACKS[locale].serif))
  })

  it('has root.tsx consume the same map instead of a hardcoded fallback tail', () => {
    expect(ROOT).toContain('defaultFontStackFor')
    // No inline copy of any locale chain may survive in the component.
    for (const locale of SUPPORTED_LOCALES) {
      expect(ROOT).not.toContain(DEFAULT_FONT_STACKS[locale].body)
      expect(ROOT).not.toContain(DEFAULT_FONT_STACKS[locale].serif)
    }
    expect(ROOT).not.toContain("'PingFang SC'")
  })
})
