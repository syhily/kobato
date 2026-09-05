import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const stylesDir = path.resolve(__dirname, '../../src/styles')

// The theming contract has two sources of truth that must never drift:
// - src/styles/theme.css holds the `@theme` token table, reference-imported
//   so Tailwind compiles utilities from it without emitting `:root`
//   declarations.
// - src/styles/index.css hand-writes the same tokens as runtime defaults
//   under `@layer theme { .inkling-lexical { … } }`, which is where hosts
//   override them.
// This suite parses both and pins name/value parity per token, plus a
// snapshot of the full token list: adding or removing a token turns the
// suite red and is an explicit contract change.

/** Plain variables bridged to tokens inside the scoped defaults block. */
const BRIDGE_VARIABLES = [
  '--white',
  '--grey-50',
  '--grey-100',
  '--grey-200',
  '--grey-300',
  '--grey-400',
  '--grey-500',
  '--grey-600',
  '--grey-700',
  '--grey-800',
  '--grey-900',
  '--grey-950',
  '--black',
  '--green',
  '--inkling-breakout-adjustment-with-fallback',
]

/** Strips block comments so commented-out declarations cannot parse. */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

/** Returns the contents of the first `{}` block following `anchor`. */
function extractBlock(css: string, anchor: string): string {
  const anchorIndex = css.indexOf(anchor)
  if (anchorIndex === -1) {
    throw new Error(`anchor not found: ${anchor}`)
  }
  const openIndex = css.indexOf('{', anchorIndex)
  let depth = 0
  for (let index = openIndex; index < css.length; index += 1) {
    if (css[index] === '{') {
      depth += 1
    } else if (css[index] === '}') {
      depth -= 1
      if (depth === 0) {
        return css.slice(openIndex + 1, index)
      }
    }
  }
  throw new Error(`unbalanced braces after anchor: ${anchor}`)
}

/** Parses `--name: value` declarations, normalizing runs of whitespace. */
function parseCustomProperties(block: string): Map<string, string> {
  const declarations = new Map<string, string>()
  for (const match of block.matchAll(/(--[\w\\.-]+)\s*:\s*([^;]+?)\s*;/g)) {
    declarations.set(match[1], match[2].replace(/\s+/g, ' '))
  }
  return declarations
}

function themeTokens(): Map<string, string> {
  const css = stripComments(fs.readFileSync(path.join(stylesDir, 'theme.css'), 'utf-8'))
  return parseCustomProperties(extractBlock(css, '@theme'))
}

function scopedDefaults(): Map<string, string> {
  const css = stripComments(fs.readFileSync(path.join(stylesDir, 'index.css'), 'utf-8'))
  const themeLayer = extractBlock(css, '@layer theme')
  return parseCustomProperties(extractBlock(themeLayer, '.inkling-lexical'))
}

describe('Theme token contract (plan C6)', () => {
  it('parses a non-trivial token table from both sources', () => {
    expect(themeTokens().size).toBeGreaterThan(100)
    expect(scopedDefaults().size).toBeGreaterThan(100)
  })

  it('declares every @theme token under .inkling-lexical with the same value', () => {
    const scoped = scopedDefaults()
    const mismatches: string[] = []
    for (const [name, value] of themeTokens()) {
      if (!scoped.has(name)) {
        mismatches.push(`${name} is missing from the .inkling-lexical defaults`)
      } else if (scoped.get(name) !== value) {
        mismatches.push(`${name}: @theme has "${value}", .inkling-lexical has "${scoped.get(name)}"`)
      }
    }
    expect(mismatches).toEqual([])
  })

  it('adds only the bridged plain variables on top of the tokens', () => {
    const theme = themeTokens()
    const extras = [...scopedDefaults().keys()].filter((name) => !theme.has(name)).sort()
    expect(extras).toEqual([...BRIDGE_VARIABLES].sort())
  })

  it('pins the full token list (name + value) as the public contract', () => {
    const entries = [...themeTokens()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, value]) => `${name}: ${value}`)
    expect(entries).toMatchSnapshot()
  })
})
