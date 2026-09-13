import { readdirSync, readFileSync } from 'node:fs'
import { join, sep } from 'node:path'

/**
 * The card pipeline's layering rule, pinned statically (CONTEXT.md: "card
 * declaration"). The pipeline works because declarations are React-free and
 * the registry layer never pulls the wrapper layer at runtime — the shim →
 * card-wrappers → decorate tree → plugins/components → shim import cycle is
 * avoided by convention today (documented piecemeal across
 * assemble-card-node, card-declaration, card-wrappers, card-commands,
 * host-card-registry, card-markdown-transformers, getEditorCardNodes); this
 * guard makes the convention fail CI instead of code review. Same pattern
 * as the render-policy guard (tests/inkling/unit/nodes-base/nodes/render-policy-imports).
 *
 * Specifiers are normalized onto the inkling layer root before judgment (the
 * same idiom as tests/inkling/unit/utils/utils-import-guard.test.ts), so a
 * relative drift import (`../AudioNode` from a declaration) is caught exactly
 * like its `@/inkling/` alias twin. The two self-check tests at the bottom pin
 * the patterns against the REAL shim/component modules on disk — a guard
 * whose patterns silently match nothing (the package-era `@/nodes/...` alias
 * outlived the dissolution here) must fail loudly, not pass vacuously.
 */

// modules the registry layer must never VALUE-import, normalized onto the
// layer root: the wrapper projections, the components/plugins layer, and the
// shim modules (by pattern — 'nodes/<Card>Node' etc.)
const WRAPPER_LAYER_TARGETS = new Set([
  'nodes/cards/card-wrappers',
  'nodes/cards/card-decorate',
  'nodes/cards/card-menus',
  'nodes/cards/card-markdown-transformers',
  'nodes/cards/card-insert-commands',
  'nodes/decorate-card',
])
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
 * Resolves an import specifier to its layer-relative target ('nodes/...',
 * 'components/...', …), or null for specifiers that do not reach into the
 * inkling layer (bare packages, node: builtins). Both alias and relative
 * forms are normalized: `@/inkling/nodes/foo` and `../nodes/foo` from a
 * src/inkling/utils file land on the same target (the repo convention is
 * `@/inkling/` — a relative path into another layer is a drift vector, not a
 * style choice). `fromFile` is a cwd-relative src path
 * ('src/inkling/nodes/cards/x.declaration.ts'). The resolution is pure string
 * math — no cwd, no filesystem — so tests can hand it any path and the
 * verdict never depends on where vitest runs from.
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
    // the wrapper-layer check below is rooted at the layer, not the repo.
    const resolved = segments.join('/')
    return resolved.startsWith('src/inkling/') ? resolved.slice('src/inkling/'.length) : resolved
  }
  return null
}

/** True when the normalized target lands on the wrapper layer. */
function isWrapperLayerTarget(normalized: string): boolean {
  return (
    WRAPPER_LAYER_TARGETS.has(normalized) ||
    FORBIDDEN_LAYERS.some((layer) => normalized === layer || normalized.startsWith(`${layer}/`)) ||
    // the shim modules: 'nodes/<Card>Node' directly under src/inkling/nodes
    // (MinimalNodes/BasicNodes/DefaultNodes are node sets, not shims)
    /^nodes\/[A-Z][A-Za-z]*Node$/.test(normalized) ||
    // the card components and their decorate renders:
    // 'nodes/<Card>NodeComponent', 'nodes/header/HeaderNodeComponent'
    /^nodes\/([A-Z][A-Za-z]*NodeComponent|header\/HeaderNodeComponent)$/.test(normalized)
  )
}

function wrapperLayerImportsOfSource(fromFile: string, source: string): string[] {
  return runtimeImportSpecifiers(source)
    .map((specifier) => ({ specifier, normalized: normalizeSpecifier(fromFile, specifier) }))
    .filter(
      ({ specifier, normalized }) =>
        specifier === 'react' || specifier === 'react-dom' || (normalized !== null && isWrapperLayerTarget(normalized)),
    )
    .map(({ specifier }) => specifier)
}

function wrapperLayerImportsOf(file: string): string[] {
  return wrapperLayerImportsOfSource(file.split(sep).join('/'), readFileSync(file, 'utf8'))
}

const REGISTRY_LAYER_FILES = [
  'src/inkling/nodes/cards/card-facts.ts',
  'src/inkling/nodes/cards/card-declaration.ts',
  'src/inkling/nodes/cards/card-commands.ts',
  'src/inkling/nodes/cards/host-card-registry.ts',
]

describe('card pipeline layering guard', () => {
  it('card declarations stay React-free and off the wrapper layer', () => {
    const declarationsDir = join('src', 'inkling', 'nodes', 'cards')
    const offenders: Record<string, string[]> = {}

    for (const name of listSourceFiles(declarationsDir).filter((name) => name.endsWith('.declaration.ts'))) {
      const imports = wrapperLayerImportsOf(join(declarationsDir, name))
      if (imports.length > 0) {
        offenders[name.split(sep).join('/')] = imports
      }
    }

    expect(offenders).toEqual({})
  })

  it('card declarations never import the command table — the direction is reversed', () => {
    // card-commands is a DERIVED VIEW over the declarations: menu entries and
    // insert specs name commands by string (CardMenuCommand), and
    // card-commands keys its command objects by node type. A declaration
    // importing card-commands (even type-only) restores the old reverse
    // dependency — fail here, not in code review.
    const declarationsDir = join('src', 'inkling', 'nodes', 'cards')
    const offenders: string[] = []

    for (const name of listSourceFiles(declarationsDir).filter((name) => name.endsWith('.declaration.ts'))) {
      const source = readFileSync(join(declarationsDir, name), 'utf8')
      if (/from\s+['"](\.\/card-commands|@\/inkling\/nodes\/cards\/card-commands)['"]/.test(source)) {
        offenders.push(name.split(sep).join('/'))
      }
    }

    expect(offenders).toEqual([])
  })

  it('registry-layer modules never value-import the wrapper layer', () => {
    const offenders: Record<string, string[]> = {}

    for (const file of REGISTRY_LAYER_FILES) {
      const imports = wrapperLayerImportsOf(file)
      if (imports.length > 0) {
        offenders[file] = imports
      }
    }

    expect(offenders).toEqual({})
  })

  it('getEditorCardNodes stays off the wrapper node registry', () => {
    // its own comment: importing the wrapper registry would close an import
    // cycle (wrapper layer → decorate tree → InklingComposableEditor →
    // DragDropPastePlugin → file-drop-routing → editor-card-nodes)
    const source = readFileSync('src/inkling/nodes/cards/editor-card-nodes.ts', 'utf8')
    expect(runtimeImportSpecifiers(source)).not.toContain('@/inkling/nodes/cards/card-wrappers')
  })

  it('self-check: the patterns match the real shim/component modules on disk', () => {
    // Non-vacuous proof — the failure mode this guards against is a pattern
    // anchored to a dead alias that matches nothing and passes forever.
    // Every top-level node shim and card component module must exist AND be
    // judged wrapper-layer; if a future refactor renames the layer alias or
    // moves these modules, this test fails before the guard goes silent.
    const nodesDir = join('src', 'inkling', 'nodes')
    const shims = readdirSync(nodesDir).filter((name) => /^[A-Z][A-Za-z]*Node\.ts$/.test(name))
    const components = readdirSync(nodesDir).filter((name) => /^[A-Z][A-Za-z]*NodeComponent\.tsx$/.test(name))
    expect(shims.length).toBeGreaterThan(10)
    expect(components.length).toBeGreaterThan(10)

    const fixture = 'src/inkling/nodes/cards/fixture.declaration.ts'
    const judged = (source: string) => wrapperLayerImportsOfSource(fixture, source)
    for (const name of [...shims, ...components]) {
      const specifier = `@/inkling/nodes/${name.replace(/\.tsx?$/, '')}`
      expect(judged(`import { X } from '${specifier}'`)).toEqual([specifier])
    }
    // the header card's component lives one directory down
    expect(judged(`import { renderHeaderCard } from '@/inkling/nodes/header/HeaderNodeComponent'`)).toEqual([
      '@/inkling/nodes/header/HeaderNodeComponent',
    ])
  })

  it('self-check: alias, relative, side-effect, dynamic and mixed-type forms are all judged', () => {
    const fixture = 'src/inkling/nodes/cards/fixture.declaration.ts'
    const judged = (source: string) => wrapperLayerImportsOfSource(fixture, source)

    // alias forms of every forbidden family
    expect(judged(`import { AudioNode } from '@/inkling/nodes/AudioNode'`)).toEqual(['@/inkling/nodes/AudioNode'])
    expect(judged(`import { renderAudioCard } from '@/inkling/nodes/AudioNodeComponent'`)).toEqual([
      '@/inkling/nodes/AudioNodeComponent',
    ])
    expect(judged(`import { useEffect } from 'react'`)).toEqual(['react'])
    expect(judged(`import { createRoot } from 'react-dom'`)).toEqual(['react-dom'])
    expect(judged(`import { CARD_WRAPPER_NODES } from '@/inkling/nodes/cards/card-wrappers'`)).toEqual([
      '@/inkling/nodes/cards/card-wrappers',
    ])
    expect(judged(`import { decorateCard } from '@/inkling/nodes/decorate-card'`)).toEqual([
      '@/inkling/nodes/decorate-card',
    ])
    expect(judged(`import InklingCardWrapper from '@/inkling/components/InklingCardWrapper'`)).toEqual([
      '@/inkling/components/InklingCardWrapper',
    ])
    expect(judged(`import { useX } from '@/inkling/hooks/x'`)).toEqual(['@/inkling/hooks/x'])
    expect(judged(`import { XPlugin } from '@/inkling/plugins/x'`)).toEqual(['@/inkling/plugins/x'])

    // relative drift forms — judged exactly like their alias twins
    expect(judged(`import { AudioNode } from '../AudioNode'`)).toEqual(['../AudioNode'])
    expect(judged(`import { renderHeaderCard } from '../header/HeaderNodeComponent'`)).toEqual([
      '../header/HeaderNodeComponent',
    ])

    // side-effect and dynamic forms
    expect(judged(`import '@/inkling/nodes/AudioNode'`)).toEqual(['@/inkling/nodes/AudioNode'])
    expect(judged(`const m = await import('@/inkling/nodes/AudioNode')`)).toEqual(['@/inkling/nodes/AudioNode'])

    // type-only imports erase, including the inline-modifier form; a mixed
    // import keeps its runtime binding and stays a violation
    expect(judged(`import type { AudioNode } from '@/inkling/nodes/AudioNode'`)).toEqual([])
    expect(judged(`import { type AudioNode } from '@/inkling/nodes/AudioNode'`)).toEqual([])
    expect(judged(`import { type AudioData, AudioNode } from '@/inkling/nodes/AudioNode'`)).toEqual([
      '@/inkling/nodes/AudioNode',
    ])

    // compliant neighbours stay free: the base layer (the bottom of the
    // stack), the node-set modules, sibling registry/declaration modules,
    // and the utils layer
    expect(judged(`import { BaseAudioNode } from '@/inkling/nodes/base/nodes/audio/AudioNode'`)).toEqual([])
    expect(judged(`import MINIMAL_NODES from '@/inkling/nodes/MinimalNodes'`)).toEqual([])
    expect(judged(`import BASIC_NODES from '@/inkling/nodes/BasicNodes'`)).toEqual([])
    expect(judged(`import { captionEditorSpec } from './caption-editor-spec'`)).toEqual([])
    expect(judged(`import { strOr } from '@/inkling/utils/value-guards'`)).toEqual([])
  })
})
