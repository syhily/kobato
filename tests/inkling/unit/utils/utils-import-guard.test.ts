import { readdirSync, readFileSync } from 'node:fs'
import { join, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The src/inkling/utils boundary, pinned statically: utils is the bottom
 * layer — framework-free helpers the upper layers pull in, never the reverse.
 * A utils module that runtime-imports the node tree or the
 * components/hooks/plugins layers closes the cycles the card pipeline guards
 * against. Type-only imports erase at runtime and stay free.
 *
 * The one carve-out: `@/inkling/nodes/base/utils/` holds pure leaf helpers (URL
 * grammar, gallery fill, card widths) shared by both trees, so importing those
 * pulls no node class, declaration, or registry; the public barrel's
 * CARD_WIDTHS re-export rides the same carve-out.
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
 * Resolves a specifier to its src-relative target ('nodes/...',
 * 'components/...'), or null for specifiers outside src. Alias and relative
 * forms both normalize, so `@/inkling/nodes/foo` and `../../nodes/foo` from a
 * utils file land on the same target. Pure string math (no cwd, no filesystem),
 * so the verdict never depends on where vitest runs.
 */
function normalizeSpecifier(fromFile: string, specifier: string): string | null {
  if (specifier.startsWith('@/inkling/')) {
    return specifier.slice('@/inkling/'.length)
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
    // Normalize onto the layer root, mirroring the '@/inkling/'.slice above —
    // the forbidden-layer check below is rooted at the layer, not the repo.
    const resolved = segments.join('/')
    return resolved.startsWith('src/inkling/') ? resolved.slice('src/inkling/'.length) : resolved
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

describe('src/inkling/utils import guard', () => {
  it('no utils module runtime-imports the node tree or the layers above it', () => {
    const offenders: Record<string, string[]> = {}

    for (const name of listSourceFiles(join('src', 'inkling', 'utils'))) {
      const file = join('src', 'inkling', 'utils', name)
      const violations = boundaryViolationsOf(file, readFileSync(file, 'utf8'))
      if (violations.length > 0) {
        offenders[`src/inkling/utils/${name.split(sep).join('/')}`] = violations
      }
    }

    expect(offenders).toEqual({})
  })

  it('catches bare-directory, relative and mixed-type import forms (regression: slash-only prefixes)', () => {
    // a src/utils file resolving relative imports into the forbidden layers
    const fixtureFile = 'src/inkling/utils/fixture.ts'

    // bare-directory alias imports — no trailing slash, so '/'-terminated
    // prefixes alone would miss them
    expect(boundaryViolationsOf(fixtureFile, `import { x } from '@/inkling/nodes'`)).toEqual(['@/inkling/nodes'])
    expect(boundaryViolationsOf(fixtureFile, `import { x } from '@/inkling/components'`)).toEqual([
      '@/inkling/components',
    ])
    expect(boundaryViolationsOf(fixtureFile, `import { x } from '@/inkling/hooks'`)).toEqual(['@/inkling/hooks'])
    expect(boundaryViolationsOf(fixtureFile, `import { x } from '@/inkling/plugins'`)).toEqual(['@/inkling/plugins'])
    // carve-out still applies to the bare base-utils directory
    expect(boundaryViolationsOf(fixtureFile, `import { x } from '@/inkling/nodes/base/utils'`)).toEqual([])

    // relative specifiers into other layers — the fixture lives at
    // src/inkling/utils, so one '..' reaches the layer root
    expect(boundaryViolationsOf(fixtureFile, `import { x } from '../nodes/base/toggle/ToggleNode'`)).toEqual([
      '../nodes/base/toggle/ToggleNode',
    ])
    expect(boundaryViolationsOf(fixtureFile, `import { x } from '../components/InklingCardWrapper'`)).toEqual([
      '../components/InklingCardWrapper',
    ])
    expect(boundaryViolationsOf(fixtureFile, `import { x } from './services/snapshot-store'`)).toEqual([])
    expect(boundaryViolationsOf(fixtureFile, `import { x } from '../nodes/base/utils/card-widths'`)).toEqual([])

    // type-only imports erase, including the inline-modifier form; a mixed
    // import keeps its runtime binding and stays a violation
    expect(boundaryViolationsOf(fixtureFile, `import type { Foo } from '@/inkling/nodes'`)).toEqual([])
    expect(boundaryViolationsOf(fixtureFile, `import { type Foo } from '@/inkling/nodes'`)).toEqual([])
    expect(boundaryViolationsOf(fixtureFile, `import { type Foo, x } from '@/inkling/nodes'`)).toEqual([
      '@/inkling/nodes',
    ])
  })
})
