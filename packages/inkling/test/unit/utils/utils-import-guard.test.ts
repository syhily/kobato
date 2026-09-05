import { readdirSync, readFileSync } from 'node:fs'
import { join, sep } from 'node:path'

/**
 * The src/utils boundary, pinned statically (CONTEXT.md: "utils layer"):
 * utils is the bottom layer — framework-free helpers the upper layers pull
 * in, never the reverse. A utils module that runtime-imports the node tree,
 * the components/hooks/plugins layers, closes the very cycles the card
 * pipeline guards against (the upload-intent / buildCardMenu /
 * getEditorCardNodes / nested-editors couplings this guard's C14 stage moved
 * to their consumers). Type-only imports erase at runtime and stay free.
 *
 * The one carve-out: `@/nodes/base/utils/` holds pure leaf helpers (URL
 * grammar, gallery fill, card widths) shared by both trees — importing those
 * pulls no node class, declaration, or registry. The public barrel's
 * CARD_WIDTHS re-export (src/utils/index.ts) rides the same carve-out.
 */

const FORBIDDEN_LAYERS = ['components', 'hooks', 'plugins'] as const

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true })
    .map(String)
    .filter((name) => /\.tsx?$/.test(name))
}

/**
 * Runtime (non-type-only) import specifiers of a source string. Two erasure
 * passes strip type-only imports before matching, so the guard checks only
 * what the runtime module graph pulls:
 * - whole-statement type imports (`import type { A } from 'x'`, multiline ok);
 * - inline type modifiers in named imports (`import { type A } from 'x'`) —
 *   when the braces are left empty the import is type-only and erased;
 *   `import { type A, b } from 'x'` keeps its runtime binding and survives.
 */
function runtimeImportSpecifiers(source: string): string[] {
  const withoutTypeImports = source
    .replace(/import\s+type\s[\s\S]{0,500}?from\s+['"][^'"]+['"]/g, '')
    .replace(/import\s+(?:type\s+)?\{([^}]*)\}\s*from\s+['"][^'"]+['"]/g, (match, body: string) => {
      // an import whose braces hold only `type X` bindings (incl. `type X as Y`)
      // is type-only and erases; any unadorned binding is a runtime import
      const hasRuntimeBinding = body.split(',').some((binding) => !/^\s*type\s/.test(binding))
      return hasRuntimeBinding ? match : ''
    })
  const statics = withoutTypeImports.matchAll(/(?:^|\s)from\s+['"]([^'"]+)['"]/g)
  const sideEffects = withoutTypeImports.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)
  const dynamics = withoutTypeImports.matchAll(/import\s*\(\s*['"]([^'"]+)['"]/g)
  return [...statics, ...sideEffects, ...dynamics].map((match) => match[1])
}

/**
 * Resolves an import specifier to its src-relative target ('nodes/...',
 * 'components/...', a bare package name, …), or null for specifiers that do
 * not reach into src (bare packages, node: builtins). Both alias and
 * relative forms are normalized: `@/nodes/foo` and `../../nodes/foo` from a
 * src/utils file land on the same target, so a relative cross-layer import
 * is caught exactly like its alias twin (the repo convention is `@/` — a
 * relative path into another layer is a drift vector, not a style choice).
 * `fromFile` is a cwd-relative src path ('src/utils/x.ts'). The resolution
 * is pure string math — no cwd, no filesystem — so tests can hand it any
 * path and the verdict never depends on where vitest runs from.
 */
function normalizeSpecifier(fromFile: string, specifier: string): string | null {
  if (specifier.startsWith('@/')) {
    return specifier.slice(2)
  }
  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    const segments = fromFile.split('/')
    segments.pop() // drop the file name, keep the directory
    for (const part of specifier.split('/')) {
      if (part === '.' || part === '') {
        continue
      }
      if (part === '..') {
        segments.pop()
      } else {
        segments.push(part)
      }
    }
    return segments.join('/')
  }
  return null
}

/** True when the normalized target lands in a forbidden layer (with the base-utils carve-out). */
function isForbiddenLayerTarget(normalized: string): boolean {
  if (normalized === 'nodes' || normalized.startsWith('nodes/')) {
    // the carve-out is the whole base-utils subtree, bare directory included
    return !normalized.startsWith('nodes/base/utils')
  }
  return FORBIDDEN_LAYERS.some((layer) => normalized === layer || normalized.startsWith(`${layer}/`))
}

function boundaryViolationsOf(file: string, source: string): string[] {
  return runtimeImportSpecifiers(source)
    .map((specifier) => ({ specifier, normalized: normalizeSpecifier(file, specifier) }))
    .filter(({ normalized }) => normalized !== null && isForbiddenLayerTarget(normalized))
    .map(({ specifier }) => specifier)
}

describe('src/utils import guard', () => {
  it('no utils module runtime-imports the node tree or the layers above it', () => {
    const offenders: Record<string, string[]> = {}

    for (const name of listSourceFiles(join('src', 'utils'))) {
      const file = join('src', 'utils', name)
      const violations = boundaryViolationsOf(file, readFileSync(file, 'utf8'))
      if (violations.length > 0) {
        offenders[`src/utils/${name.split(sep).join('/')}`] = violations
      }
    }

    expect(offenders).toEqual({})
  })

  it('catches bare-directory, relative and mixed-type import forms (regression: slash-only prefixes)', () => {
    // a src/utils file resolving relative imports into the forbidden layers
    const fixtureFile = 'src/utils/fixture.ts'

    // bare-directory alias imports — '@/nodes' (no trailing slash) used to slip
    // past the '/'-terminated prefixes
    expect(boundaryViolationsOf(fixtureFile, `import { x } from '@/nodes'`)).toEqual(['@/nodes'])
    expect(boundaryViolationsOf(fixtureFile, `import { x } from '@/components'`)).toEqual(['@/components'])
    expect(boundaryViolationsOf(fixtureFile, `import { x } from '@/hooks'`)).toEqual(['@/hooks'])
    expect(boundaryViolationsOf(fixtureFile, `import { x } from '@/plugins'`)).toEqual(['@/plugins'])
    // carve-out still applies to the bare base-utils directory
    expect(boundaryViolationsOf(fixtureFile, `import { x } from '@/nodes/base/utils'`)).toEqual([])

    // relative specifiers into other layers — previously not judged at all
    expect(boundaryViolationsOf(fixtureFile, `import { x } from '../../nodes/base/toggle/ToggleNode'`)).toEqual([
      '../../nodes/base/toggle/ToggleNode',
    ])
    expect(boundaryViolationsOf(fixtureFile, `import { x } from '../../components/InklingCardWrapper'`)).toEqual([
      '../../components/InklingCardWrapper',
    ])
    expect(boundaryViolationsOf(fixtureFile, `import { x } from '../services/snapshot-store'`)).toEqual([])
    expect(boundaryViolationsOf(fixtureFile, `import { x } from '../../nodes/base/utils/card-widths'`)).toEqual([])

    // type-only imports erase, including the inline-modifier form; a mixed
    // import keeps its runtime binding and stays a violation
    expect(boundaryViolationsOf(fixtureFile, `import type { Foo } from '@/nodes'`)).toEqual([])
    expect(boundaryViolationsOf(fixtureFile, `import { type Foo } from '@/nodes'`)).toEqual([])
    expect(boundaryViolationsOf(fixtureFile, `import { type Foo, x } from '@/nodes'`)).toEqual(['@/nodes'])
  })
})
