import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { __TOKENS_FOR_TESTS } from '@/ui/lib/cn'

// Contract: cn.ts's hand-written tailwind-merge tables must mirror the
// @theme inline tokens in tailwind.css exactly — tailwind-merge cannot
// parse those blocks, so drift silently re-collapses token namespaces.

interface ParsedThemeBlocks {
  byNamespace: Map<string, Set<string>>
}

function parseThemeBlocks(css: string): ParsedThemeBlocks {
  const byNamespace = new Map<string, Set<string>>()
  const startRe = /@theme\s+inline\s*\{/g
  let match: RegExpExecArray | null
  match = startRe.exec(css)
  while (match !== null) {
    let depth = 1
    let i = match.index + match[0].length
    const blockStart = i
    while (i < css.length && depth > 0) {
      const ch = css[i]
      if (ch === '{') {
        depth++
      } else if (ch === '}') {
        depth--
      }
      i++
    }
    const blockEnd = i - 1
    const block = css.slice(blockStart, blockEnd)

    const knownNamespaces = [
      ...new Set([
        ...Object.keys(__TOKENS_FOR_TESTS.registered),
        ...__TOKENS_FOR_TESTS.omitted,
        ...BELOW_THE_LINE_NAMESPACES,
        'z-index',
      ]),
    ].sort((a, b) => b.length - a.length)
    const declRe = new RegExp(`(?:^|\n)\\s*--(${knownNamespaces.join('|')})-([a-z0-9-]+)\\s*:`, 'g')
    let decl: RegExpExecArray | null
    decl = declRe.exec(block)
    while (decl !== null) {
      const ns = decl[1]
      const name = decl[2]
      let bucket = byNamespace.get(ns)
      if (bucket === undefined) {
        bucket = new Set<string>()
        byNamespace.set(ns, bucket)
      }
      bucket.add(name)
      decl = declRe.exec(block)
    }
    match = startRe.exec(css)
  }
  return { byNamespace }
}

// Namespaces cn() never composes, or non-utility values read by arbitrary-value utilities.
const BELOW_THE_LINE_NAMESPACES = new Set<string>(['breakpoint', 'container', 'ring', 'size', 'width', 'z'])

const CSS_PATH = 'src/styles/tailwind.css'

describe('contract: @theme tokens are mirrored into tailwind-merge', () => {
  const css = readFileSync(CSS_PATH, 'utf8')
  const { byNamespace } = parseThemeBlocks(css)

  it('every namespace in tailwind.css is either registered, omitted, or marked below-the-line', () => {
    const cssNamespaces = [...byNamespace.keys()].sort()
    const registered = new Set(Object.keys(__TOKENS_FOR_TESTS.registered))
    const omitted = new Set<string>(__TOKENS_FOR_TESTS.omitted)

    const undecided = cssNamespaces.filter(
      (ns) => !registered.has(ns) && !omitted.has(ns) && !BELOW_THE_LINE_NAMESPACES.has(ns),
    )

    expect(
      undecided,
      [
        `tailwind.css declares one or more @theme namespaces that nobody`,
        `decided about: ${undecided.join(', ')}.`,
        `Pick one:`,
        `  - register the tokens in src/ui/lib/cn.ts via extendTailwindMerge`,
        `    (preferred when cn() can compose a token in this namespace),`,
        `  - add the namespace to __TOKENS_FOR_TESTS.omitted in cn.ts and`,
        `    document why registration is wrong,`,
        `  - or add the namespace to BELOW_THE_LINE_NAMESPACES in this test`,
        `    and document why no cn() call site can collide on it.`,
      ].join('\n'),
    ).toEqual([])
  })

  it('every registered namespace agrees exactly with tailwind.css', () => {
    const drift: { namespace: string; missingFromCn: string[]; staleInCn: string[] }[] = []
    for (const [namespace, tokens] of Object.entries(__TOKENS_FOR_TESTS.registered)) {
      const cssTokens = byNamespace.get(namespace) ?? new Set<string>()
      const cnTokens = new Set<string>(tokens)

      const missingFromCn = [...cssTokens].filter((token) => !cnTokens.has(token)).sort()
      const staleInCn = [...cnTokens].filter((token) => !cssTokens.has(token)).sort()

      if (missingFromCn.length > 0 || staleInCn.length > 0) {
        drift.push({ namespace, missingFromCn, staleInCn })
      }
    }

    expect(
      drift,
      [
        `src/ui/lib/cn.ts disagrees with src/styles/tailwind.css.`,
        `For each namespace below, the entries under "missingFromCn" exist in`,
        `the CSS but were not registered with extendTailwindMerge -- a future`,
        `cn() call composing two tokens of the same namespace prefix may`,
        `silently dedupe to a single class. The entries under "staleInCn" no`,
        `longer exist in the CSS and should be removed from cn.ts.`,
      ].join('\n'),
    ).toEqual([])
  })

  it('every omitted namespace still exists in tailwind.css', () => {
    const omitted = __TOKENS_FOR_TESTS.omitted
    const ghost = omitted.filter((namespace) => !byNamespace.has(namespace))

    expect(
      ghost,
      [
        `__TOKENS_FOR_TESTS.omitted lists ${ghost.join(', ')}, but those`,
        `namespaces are no longer present in tailwind.css. Drop the entry`,
        `from cn.ts so the omission decision does not outlive its reason.`,
      ].join('\n'),
    ).toEqual([])
  })
})
