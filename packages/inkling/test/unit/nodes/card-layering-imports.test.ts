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
 * as the render-policy guard (test/nodes-base/nodes/render-policy-imports).
 */

// modules the registry layer must never VALUE-import: the wrapper
// projections, React, the components/plugins layer, and the shim modules
// (named by prefix — '@/nodes/AudioNode' etc.)
const WRAPPER_LAYER_SPECIFIERS = new Set([
  '@/nodes/cards/card-wrappers',
  '@/nodes/cards/card-decorate',
  '@/nodes/cards/card-menus',
  '@/nodes/cards/card-markdown-transformers',
  '@/nodes/cards/card-insert-commands',
  '@/nodes/decorate-card',
])
const FORBIDDEN_PREFIXES = ['@/components/', '@/hooks/', '@/plugins/']

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true })
    .map(String)
    .filter((name) => /\.tsx?$/.test(name))
}

/** Runtime (non-type-only) import specifiers of a source file. */
function runtimeImportSpecifiers(file: string): string[] {
  const source = readFileSync(file, 'utf8')
  // erase whole-statement type imports (possibly multiline) before matching,
  // so the guard checks only what the runtime module graph pulls
  const withoutTypeImports = source.replace(/import\s+type\s[\s\S]{0,500}?from\s+['"][^'"]+['"]/g, '')
  const statics = withoutTypeImports.matchAll(/(?:^|\s)from\s+['"]([^'"]+)['"]/g)
  const sideEffects = withoutTypeImports.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)
  const dynamics = withoutTypeImports.matchAll(/import\s*\(\s*['"]([^'"]+)['"]/g)
  return [...statics, ...sideEffects, ...dynamics].map((match) => match[1])
}

function wrapperLayerImportsOf(file: string): string[] {
  return runtimeImportSpecifiers(file).filter(
    (specifier) =>
      specifier === 'react' ||
      specifier === 'react-dom' ||
      WRAPPER_LAYER_SPECIFIERS.has(specifier) ||
      FORBIDDEN_PREFIXES.some((prefix) => specifier.startsWith(prefix)) ||
      // the shim modules: '@/nodes/<Card>Node' directly under src/nodes
      // (MinimalNodes/BasicNodes are node sets, not shims)
      /^@\/nodes\/[A-Z][A-Za-z]*Node$/.test(specifier) ||
      // the card components and their decorate renders:
      // '@/nodes/<Card>NodeComponent', '@/nodes/header/HeaderNodeComponent'
      /^@\/nodes\/([A-Z][A-Za-z]*NodeComponent|header\/HeaderNodeComponent)$/.test(specifier),
  )
}

const REGISTRY_LAYER_FILES = [
  'src/nodes/cards/card-facts.ts',
  'src/nodes/cards/card-declaration.ts',
  'src/nodes/cards/card-commands.ts',
  'src/nodes/cards/host-card-registry.ts',
  'src/nodes/cards/derive-card-nodes.ts',
]

describe('card pipeline layering guard', () => {
  it('card declarations stay React-free and off the wrapper layer', () => {
    const declarationsDir = join('src', 'nodes', 'cards')
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
    const declarationsDir = join('src', 'nodes', 'cards')
    const offenders: string[] = []

    for (const name of listSourceFiles(declarationsDir).filter((name) => name.endsWith('.declaration.ts'))) {
      const source = readFileSync(join(declarationsDir, name), 'utf8')
      if (/from\s+['"](\.\/card-commands|@\/nodes\/cards\/card-commands)['"]/.test(source)) {
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
    expect(runtimeImportSpecifiers('src/nodes/cards/editor-card-nodes.ts')).not.toContain('@/nodes/cards/card-wrappers')
  })
})
