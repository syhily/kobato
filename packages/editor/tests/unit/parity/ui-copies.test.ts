import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * Copy-parity guard: the admin editor (`packages/editor`) keeps working
 * copies of shared `@kobato/ui` modules. The editor package cannot import
 * `@kobato/ui` components directly for its admin body editor — the ui
 * components drag in app-agnostic chrome that does not belong in the
 * editor bundle — so the editor duplicates a pinned set of ui files under
 * `src/engine/components` and `src/lib` instead.
 *
 * The duplication is fine; silent drift is not. A fixed list of copy
 * pairs is pinned here and compared with import paths normalized away:
 *
 *   - `@kobato/editor/engine/components/*` ↔ `@kobato/ui/components/*`
 *   - `@kobato/editor/lib/*` ↔ `@kobato/ui/lib/*` (and
 *     `@kobato/editor/lib/components/*` ↔ `@kobato/ui/components/*` —
 *     the tooltip copy that moved out of the engine with the neutral
 *     pieces in stage 6)
 *
 * Every other specifier (`@kobato/shared/*`, `react`, `motion`, relative
 * `./`/`../` — the copy trees mirror the ui tree one level deep, so
 * relative paths agree verbatim) must already match byte-for-byte.
 *
 * To make the comparison insensitive to import-statement *placement*
 * (the copies were taken from files whose import order drifted), the
 * import lines are compared as sorted sets and the remaining body lines
 * in order — a real drift (changed markup, changed logic, an added or
 * removed dependency, a renamed symbol) breaks one or both comparisons.
 *
 * Fixing a drift: change the ui module first, then re-copy it into the
 * editor tree adjusting only the `@kobato/editor/...` import prefixes.
 * Adding a new copy pair: append it to COPY_PAIRS with a note.
 */

interface CopyPair {
  /** Copy location inside `packages/editor/src`. */
  editorPath: string
  /** Original location inside `packages/ui/src`. */
  uiPath: string
  /** Where the pair came from. */
  note: string
}

const COPY_PAIRS: CopyPair[] = [
  // shadcn component copies (`engine/components` mirrors `ui/components`).
  { editorPath: 'engine/components/badge.tsx', uiPath: 'components/badge.tsx', note: 'shadcn badge' },
  { editorPath: 'engine/components/button.tsx', uiPath: 'components/button.tsx', note: 'shadcn button' },
  { editorPath: 'engine/components/checkbox.tsx', uiPath: 'components/checkbox.tsx', note: 'shadcn checkbox' },
  { editorPath: 'engine/components/dialog.tsx', uiPath: 'components/dialog.tsx', note: 'shadcn dialog' },
  { editorPath: 'engine/components/input.tsx', uiPath: 'components/input.tsx', note: 'shadcn input' },
  { editorPath: 'engine/components/label.tsx', uiPath: 'components/label.tsx', note: 'shadcn label' },
  {
    editorPath: 'engine/components/lazy-motion.tsx',
    uiPath: 'components/lazy-motion.tsx',
    note: 'shared motion lazy handles',
  },
  { editorPath: 'engine/components/popover.tsx', uiPath: 'components/popover.tsx', note: 'shadcn popover' },
  { editorPath: 'engine/components/radio-group.tsx', uiPath: 'components/radio-group.tsx', note: 'shadcn radio-group' },
  { editorPath: 'engine/components/select.tsx', uiPath: 'components/select.tsx', note: 'shadcn select' },
  { editorPath: 'engine/components/separator.tsx', uiPath: 'components/separator.tsx', note: 'shadcn separator' },
  { editorPath: 'engine/components/textarea.tsx', uiPath: 'components/textarea.tsx', note: 'shadcn textarea' },
  {
    editorPath: 'lib/components/tooltip.tsx',
    uiPath: 'components/tooltip.tsx',
    note: 'shadcn tooltip (moved out of engine with the neutral pieces)',
  },
  // Tool copies (`lib` mirrors `ui/lib`).
  { editorPath: 'lib/cn.ts', uiPath: 'lib/cn.ts', note: 'tailwind-merge cn helper' },
  { editorPath: 'lib/cva.ts', uiPath: 'lib/cva.ts', note: 'cva re-export' },
  { editorPath: 'lib/clsx.ts', uiPath: 'lib/clsx.ts', note: 'clsx re-export' },
  { editorPath: 'lib/code-languages.ts', uiPath: 'lib/code-languages.ts', note: 'code language table' },
  { editorPath: 'lib/use-media-query.ts', uiPath: 'lib/use-media-query.ts', note: 'media query hook' },
  { editorPath: 'lib/sanitize-html.ts', uiPath: 'lib/sanitize-html.ts', note: 'sanitize facade' },
  // Widget copies (`widgets` mirrors `ui`'s flat surface).
  {
    editorPath: 'widgets/aplayer/icons/create-icon.tsx',
    uiPath: 'icons/create-icon.tsx',
    note: 'aplayer lucide create-icon wrapper',
  },
  {
    editorPath: 'lib/sanitize-html-engine.browser.ts',
    uiPath: 'lib/sanitize-html-engine.browser.ts',
    note: 'browser sanitize engine',
  },
  {
    editorPath: 'lib/sanitize-html-engine.node.ts',
    uiPath: 'lib/sanitize-html-engine.node.ts',
    note: 'node sanitize engine',
  },
  // Removed copy pairs (stage 4): `lib/link.ts` and
  // `lib/sanitize-html-config.ts` were pure, dependency-free
  // modules whose single source moved to `@kobato/shared` (`safe-rel`,
  // `sanitize-html-config`) — both editor and ui import them from there,
  // so there is no copy left to drift. The sanitize facade/engines above
  // still duplicate ui's `lib/*` (their node engine imports the
  // sanitize-html npm package and the browser engine uses DOMPurify), and
  // the server package carries its own node-only copy pinned by
  // `packages/server/tests/unit/render/sanitize-html-parity.test.ts`.
]

const EDITOR_ROOT = 'packages/editor/src'
const UI_ROOT = 'packages/ui/src'

/** `@kobato/editor/{engine/components,lib,lib/components}/*` → the ui paths the copies mirror. */
const EDITOR_TO_UI_PREFIXES: [string, string][] = [
  ['@kobato/editor/engine/components/', '@kobato/ui/components/'],
  ['@kobato/editor/lib/components/', '@kobato/ui/components/'],
  ['@kobato/editor/lib/', '@kobato/ui/lib/'],
  // Literal specifier, not a prefix: the create-icon copy's icon-node
  // types come from the editor's local `engine/lib/icons-types` (the
  // mirror of ui's `icons/types`), and the engine path has no ui-prefix
  // twin to map generically.
  ['@kobato/editor/engine/lib/icons-types', '@kobato/ui/icons/types'],
]

function normalizeImportLine(line: string): string {
  let out = line
  for (const [editorPrefix, uiPrefix] of EDITOR_TO_UI_PREFIXES) {
    out = out.replaceAll(editorPrefix, uiPrefix)
  }
  return out
}

function splitContent(content: string): { imports: string[]; body: string[] } {
  const imports: string[] = []
  const body: string[] = []
  for (const line of content.split('\n')) {
    if (/^import\s/.test(line)) {
      imports.push(line)
    } else {
      body.push(line)
    }
  }
  return { imports, body }
}

function readPair(pair: CopyPair): {
  editor: { imports: string[]; body: string[]; raw: string }
  ui: { imports: string[]; body: string[] }
} {
  const editor = readFileSync(`${EDITOR_ROOT}/${pair.editorPath}`, 'utf8')
  const ui = readFileSync(`${UI_ROOT}/${pair.uiPath}`, 'utf8')
  return { editor: { ...splitContent(editor), raw: editor }, ui: splitContent(ui) }
}

describe('parity: editor copies mirror packages/ui (no drift)', () => {
  for (const pair of COPY_PAIRS) {
    const { editor, ui } = readPair(pair)

    it(`${pair.editorPath} matches ${pair.uiPath} (${pair.note})`, () => {
      // The copy must never import `@kobato/ui/...` itself — a reverse
      // import would be normalized into equality with the ui original's
      // own ui imports (masking the drift: the copy would secretly depend
      // on the very package it exists to avoid). Checked on the RAW file
      // (imports + body + comments) so no normalization can hide it. No
      // current copy carries a legitimate ui reference (whitelist + note
      // here if a future copy must mention the ui origin in a comment —
      // spell it without the bare specifier).
      expect(editor.raw, `${pair.editorPath} must not import @kobato/ui/`).not.toMatch(/@kobato\/ui\//)

      const editorImports = editor.imports.map(normalizeImportLine).sort()
      const uiImports = ui.imports.map(normalizeImportLine).sort()

      expect(
        editorImports,
        [
          `import set drift: ${pair.editorPath} vs ${pair.uiPath}.`,
          `The copy must import exactly the modules the ui original does`,
          `(with only the package prefix rewritten). Added or removed`,
          `imports mean one side gained a dependency the other lacks:`,
          `  editor-only: ${editorImports.filter((line) => !uiImports.includes(line)).join(' | ')}`,
          `  ui-only:     ${uiImports.filter((line) => !editorImports.includes(line)).join(' | ')}`,
        ].join('\n'),
      ).toEqual(uiImports)

      expect(
        editor.body,
        [
          `body drift: ${pair.editorPath} no longer matches ${pair.uiPath} after`,
          `import lines are stripped. Fix the ui module first, then re-copy`,
          `it into ${EDITOR_ROOT}/${pair.editorPath} adjusting only the`,
          `@kobato/editor/... import prefixes.`,
        ].join('\n'),
      ).toEqual(ui.body)
    })
  }
})
