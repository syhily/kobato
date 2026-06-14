import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { __TOKENS_FOR_TESTS } from '@/ui/lib/cn'

const CSS_PATH = resolve(process.cwd(), 'src/styles/tailwind.css')

/** Namespaces that are Tailwind builtins and do not need registration in cn.ts. */
const BUILTIN_NAMESPACES = new Set(['breakpoint', 'container'])

/** Namespaces inside `@theme inline` that are NOT standard Tailwind theme
 *  keys but are still valid (e.g. `@keyframes` blocks, CSS variable prefixes
 *  that Tailwind v4 recognises natively). */
const ALLOWED_UNREGISTERED_NAMESPACES = new Set([
  // `@keyframes` declarations live inside `@theme inline` in Tailwind v4
  'keyframes',
])

/** Known @theme inline namespaces used in this project (ordered by length desc for
 *  precise matching). */
const KNOWN_THEME_NAMESPACES = [
  'spacing',
  'container',
  'breakpoint',
  'animate',
  'radius',
  'shadow',
  'leading',
  'color',
  'font',
  'size',
  'text',
  'z-index',
  'z',
] as const

function extractThemeInlineTokens(css: string): Map<string, Set<string>> {
  const start = css.indexOf('@theme inline {')
  if (start === -1) {
    throw new Error('Could not find @theme inline block in tailwind.css')
  }
  const braceStart = css.indexOf('{', start)
  let depth = 1
  let end = braceStart + 1
  while (depth > 0 && end < css.length) {
    if (css[end] === '{') {
      depth++
    } else if (css[end] === '}') {
      depth--
    }
    end++
  }
  const block = css.slice(braceStart + 1, end - 1)

  const tokens = new Map<string, Set<string>>()
  const nsPattern = KNOWN_THEME_NAMESPACES.slice()
    .sort((a, b) => b.length - a.length)
    .join('|')
  const regex = new RegExp(`^\\s*--(${nsPattern})-([\\w-]+)\\s*:`, 'gm')
  let m: RegExpExecArray | null
  while ((m = regex.exec(block)) !== null) {
    const [, namespace, name] = m
    if (!tokens.has(namespace)) {
      tokens.set(namespace, new Set())
    }
    tokens.get(namespace)!.add(name)
  }
  return tokens
}

describe('tailwind.css @theme inline ↔ cn.ts token parity', () => {
  const css = readFileSync(CSS_PATH, 'utf-8')
  const themeTokens = extractThemeInlineTokens(css)
  const registered = __TOKENS_FOR_TESTS.registered as Record<string, readonly string[]>
  const omitted = new Set(__TOKENS_FOR_TESTS.omitted as readonly string[])

  it('every @theme inline token namespace is either registered, omitted, or explicitly allowed', () => {
    for (const namespace of themeTokens.keys()) {
      if (BUILTIN_NAMESPACES.has(namespace)) {
        continue
      }
      if (ALLOWED_UNREGISTERED_NAMESPACES.has(namespace)) {
        continue
      }
      if (omitted.has(namespace)) {
        continue
      }
      expect(
        registered[namespace],
        `Namespace "${namespace}" is declared in @theme inline but not registered in cn.ts`,
      ).toBeDefined()
    }
  })

  it('every registered namespace has at least one token in @theme inline', () => {
    for (const namespace of Object.keys(registered)) {
      expect(
        themeTokens.has(namespace),
        `Namespace "${namespace}" is registered in cn.ts but missing from @theme inline`,
      ).toBe(true)
    }
  })

  it('every token in @theme inline is present in the cn.ts registry for its namespace', () => {
    for (const [namespace, names] of themeTokens) {
      if (BUILTIN_NAMESPACES.has(namespace)) {
        continue
      }
      if (ALLOWED_UNREGISTERED_NAMESPACES.has(namespace)) {
        continue
      }
      if (omitted.has(namespace)) {
        continue
      }

      const reg = registered[namespace]
      expect(reg, `Namespace "${namespace}" not registered in cn.ts`).toBeDefined()

      for (const name of names) {
        expect(
          reg!.includes(name),
          `Token "${namespace}-${name}" is in @theme inline but not registered in cn.ts`,
        ).toBe(true)
      }
    }
  })
})
