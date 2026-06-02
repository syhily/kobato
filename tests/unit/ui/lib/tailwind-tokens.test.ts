import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { __TOKENS_FOR_TESTS } from '@/ui/lib/cn'

// Why this contract test exists.
//
// Custom design tokens live in @theme inline blocks in
// src/styles/tailwind.css. tailwind-merge does not parse those
// blocks, so src/ui/lib/cn.ts hand-mirrors the token names into
// extendTailwindMerge under the matching theme key. A forgotten
// registration silently reintroduces the original bug -- two tokens
// from different Tailwind v4 namespaces collapsing to one because
// tailwind-merge cannot tell them apart.
//
// This test diffs the token universe in tailwind.css against the
// hand-written tables in cn.ts and fails noisily on drift, so a
// forgotten --color-foo or --text-foo trips CI immediately. It also
// guards the reverse direction: a stale entry in cn.ts that no
// longer corresponds to a CSS token also fails the test, which keeps
// the lists from drifting into "almost right".

interface ParsedThemeBlocks {
  // namespace -> set of token suffixes after the leading -- and the namespace prefix
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

    // Each declaration line looks like
    //   --<ns>-<name>: <value>;
    // where <ns> is the Tailwind v4 namespace text|color|shadow|...
    // and <name> can contain hyphens and digits.
    const declRe = /(?:^|\n)\s*--([a-z]+)-([a-z0-9-]+)\s*:/g
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

// Some namespaces drive utilities the project does not currently
// compose with cn() (e.g. --breakpoint-* never participates in a
// className), or they describe non-utility values (e.g. --container-*,
// --width-popup-mobile, --size-qr-dialog are read by hand-authored
// arbitrary-value utilities like w-popup-mobile that already round-trip
// through tailwind-merge as opaque names).
//
// We only require explicit treatment for namespaces that DO drive
// arbitrating utilities through tailwind-merge. The rule of thumb is:
// if a token in this namespace can collide with another token of the
// same prefix at a cn() call site, it must be registered or omitted.
// Everything else is "below the line" and the test does not care.
//
// Below-the-line namespaces are spelled out so the test still notices
// a brand-new namespace that nobody decided about yet -- if a token
// lands in a new namespace, the test fails until a maintainer either
// registers it, omits it, or moves it below the line consciously.
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
      // Widen the literal-union element type to plain string so set
      // membership checks compare freely against the CSS-side strings.
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
