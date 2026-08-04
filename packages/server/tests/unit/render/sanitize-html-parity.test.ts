import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * Copy-parity guard: the server package keeps node-only working copies of
 * the ui sanitize modules (`render/sanitize-html.ts` +
 * `render/sanitize-html-engine.node.ts`). The string renderers under
 * `render/lexical-html/` sanitize `shiki` / `math` fragments at SSR time,
 * but the ui/editor facades are wired for the vite client alias (their
 * node engines are swapped for the DOMPurify browser twin in the browser
 * bundle) and the server must not import the editor package for rendering
 * (stage 4: string renderers live in the server package). Strategy data
 * lives once in `@kobato/shared/sanitize-html-config`; what remains
 * duplicated here is the thin engine/facade shell over the sanitize-html
 * npm package (a server devDependency).
 *
 * The duplication is fine; silent drift is not. A fixed list of pairs is
 * pinned against `packages/ui/src/lib/*` (the canonical copies):
 * comment lines are stripped (each copy documents its own context) and
 * import lines are compared as normalized sorted sets
 * (`@kobato/ui/lib/` → `@kobato/server/render/`), the remaining body
 * lines in order. A real drift — changed allowlist plumbing, a renamed
 * strategy, an added or removed dependency, a changed export — breaks
 * one or both comparisons.
 *
 * Fixing a drift: change the ui module first, then re-copy it here
 * adjusting only the `@kobato/ui/...` import prefixes.
 */

interface CopyPair {
  /** Copy location inside `packages/server/src`. */
  serverPath: string
  /** Original location inside `packages/ui/src`. */
  uiPath: string
  /** Where the pair came from. */
  note: string
}

const COPY_PAIRS: CopyPair[] = [
  { serverPath: 'render/sanitize-html.ts', uiPath: 'lib/sanitize-html.ts', note: 'sanitize facade' },
  {
    serverPath: 'render/sanitize-html-engine.node.ts',
    uiPath: 'lib/sanitize-html-engine.node.ts',
    note: 'node sanitize engine',
  },
]

const SERVER_ROOT = 'packages/server/src'
const UI_ROOT = 'packages/ui/src'

function stripCommentLines(lines: string[]): string[] {
  return lines.filter((line) => !line.trim().startsWith('//'))
}

function splitContent(content: string): { imports: string[]; body: string[] } {
  const imports: string[] = []
  const body: string[] = []
  for (const line of stripCommentLines(content.split('\n'))) {
    if (/^import\s/.test(line)) {
      imports.push(line)
    } else {
      body.push(line)
    }
  }
  return { imports, body }
}

describe('parity: server render/sanitize copies mirror packages/ui (no drift)', () => {
  for (const pair of COPY_PAIRS) {
    const raw = readFileSync(`${SERVER_ROOT}/${pair.serverPath}`, 'utf8')
    const server = splitContent(raw)
    const ui = splitContent(readFileSync(`${UI_ROOT}/${pair.uiPath}`, 'utf8'))

    it(`${pair.serverPath} matches ${pair.uiPath} (${pair.note})`, () => {
      // The copy must never import `@kobato/ui/...` itself — a reverse
      // import would be normalized into equality with the ui original's
      // own ui imports (masking the drift: the server copy would secretly
      // depend on the vite-client-alias facade it exists to avoid).
      // Checked on the RAW file so no normalization can hide it.
      expect(raw, `${pair.serverPath} must not import @kobato/ui/`).not.toMatch(/@kobato\/ui\//)

      const serverImports = server.imports
        .map((line) => line.replaceAll('@kobato/ui/lib/', '@kobato/server/render/'))
        .sort()
      const uiImports = ui.imports.map((line) => line.replaceAll('@kobato/ui/lib/', '@kobato/server/render/')).sort()

      expect(
        serverImports,
        [
          `import set drift: ${pair.serverPath} vs ${pair.uiPath}.`,
          `The copy must import exactly the modules the ui original does`,
          `(with only the package prefix rewritten). Added or removed`,
          `imports mean one side gained a dependency the other lacks:`,
          `  server-only: ${serverImports.filter((line) => !uiImports.includes(line)).join(' | ')}`,
          `  ui-only:     ${uiImports.filter((line) => !serverImports.includes(line)).join(' | ')}`,
        ].join('\n'),
      ).toEqual(uiImports)

      expect(
        server.body,
        [
          `body drift: ${pair.serverPath} no longer matches ${pair.uiPath} after`,
          `comment and import lines are stripped. Fix the ui module first,`,
          `then re-copy it into ${SERVER_ROOT}/${pair.serverPath} adjusting`,
          `only the @kobato/ui/... import prefixes.`,
        ].join('\n'),
      ).toEqual(ui.body)
    })
  }
})
