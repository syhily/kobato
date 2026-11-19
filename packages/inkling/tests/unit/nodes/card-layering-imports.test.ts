import { readdirSync, readFileSync } from 'node:fs'
import { join, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

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

function runtimeImportSpecifiers(source: string): string[] {
  const withoutTypeImports = source
    .replace(/import\s+type\s[\s\S]{0,500}?from\s+['"][^'"]+['"]/g, '')
    .replace(/import\s+(?:type\s+)?\{([^}]*)\}\s*from\s+['"][^'"]+['"]/g, (match, body: string) => {
      const hasRuntimeBinding = body.split(',').some((binding) => !/^\s*type\s/.test(binding))
      return hasRuntimeBinding ? match : ''
    })
  const statics = withoutTypeImports.matchAll(/(?:^|\s)from\s+['"]([^'"]+)['"]/g)
  const sideEffects = withoutTypeImports.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)
  const dynamics = withoutTypeImports.matchAll(/import\s*\(\s*['"]([^'"]+)['"]/g)
  return [...statics, ...sideEffects, ...dynamics].map((match) => match[1])
}

function normalizeSpecifier(fromFile: string, specifier: string): string | null {
  if (specifier.startsWith('@kobato/inkling-internal/')) {
    return specifier.slice('@kobato/inkling-internal/'.length)
  }
  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    const segments = fromFile.split('/')
    segments.pop()
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

    const resolved = segments.join('/')
    return resolved.startsWith('packages/inkling/src/') ? resolved.slice('packages/inkling/src/'.length) : resolved
  }
  return null
}

function isWrapperLayerTarget(normalized: string): boolean {
  return (
    WRAPPER_LAYER_TARGETS.has(normalized) ||
    FORBIDDEN_LAYERS.some((layer) => normalized === layer || normalized.startsWith(`${layer}/`)) ||
    /^nodes\/[A-Z][A-Za-z]*Node$/.test(normalized) ||
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
  'packages/inkling/src/nodes/cards/card-facts.ts',
  'packages/inkling/src/nodes/cards/card-declaration.ts',
  'packages/inkling/src/nodes/cards/card-commands.ts',
  'packages/inkling/src/nodes/cards/host-card-registry.ts',
]

describe('card pipeline layering guard', () => {
  it('card declarations stay React-free and off the wrapper layer', () => {
    const declarationsDir = join('packages', 'inkling', 'src', 'nodes', 'cards')
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
    const declarationsDir = join('packages', 'inkling', 'src', 'nodes', 'cards')
    const offenders: string[] = []

    for (const name of listSourceFiles(declarationsDir).filter((name) => name.endsWith('.declaration.ts'))) {
      const source = readFileSync(join(declarationsDir, name), 'utf8')
      if (/from\s+['"](\.\/card-commands|@kobato\/inkling-internal\/nodes\/cards\/card-commands)['"]/.test(source)) {
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
    const source = readFileSync('packages/inkling/src/nodes/cards/editor-card-nodes.ts', 'utf8')
    const normalized = runtimeImportSpecifiers(source).map((specifier) =>
      normalizeSpecifier('packages/inkling/src/nodes/cards/editor-card-nodes.ts', specifier),
    )
    expect(normalized).not.toContain('nodes/cards/card-wrappers')
  })

  it('self-check: the patterns match the real shim/component modules on disk', () => {
    const nodesDir = join('packages', 'inkling', 'src', 'nodes')
    const shims = readdirSync(nodesDir).filter((name) => /^[A-Z][A-Za-z]*Node\.ts$/.test(name))
    const components = readdirSync(nodesDir).filter((name) => /^[A-Z][A-Za-z]*NodeComponent\.tsx$/.test(name))
    expect(shims.length).toBeGreaterThan(10)
    expect(components.length).toBeGreaterThan(10)
    const fixture = 'packages/inkling/src/nodes/cards/fixture.declaration.ts'
    const judged = (source: string) => wrapperLayerImportsOfSource(fixture, source)
    for (const name of [...shims, ...components]) {
      const specifier = `@kobato/inkling-internal/nodes/${name.replace(/\.tsx?$/, '')}`
      expect(judged(`import { X } from '${specifier}'`)).toEqual([specifier])
    }

    expect(
      judged(`import { renderHeaderCard } from '@kobato/inkling-internal/nodes/header/HeaderNodeComponent'`),
    ).toEqual(['@kobato/inkling-internal/nodes/header/HeaderNodeComponent'])
  })

  it('self-check: alias, relative, side-effect, dynamic and mixed-type forms are all judged', () => {
    const fixture = 'packages/inkling/src/nodes/cards/fixture.declaration.ts'
    const judged = (source: string) => wrapperLayerImportsOfSource(fixture, source)

    expect(judged(`import { AudioNode } from '@kobato/inkling-internal/nodes/AudioNode'`)).toEqual([
      '@kobato/inkling-internal/nodes/AudioNode',
    ])
    expect(judged(`import { renderAudioCard } from '@kobato/inkling-internal/nodes/AudioNodeComponent'`)).toEqual([
      '@kobato/inkling-internal/nodes/AudioNodeComponent',
    ])
    expect(judged(`import { useEffect } from 'react'`)).toEqual(['react'])
    expect(judged(`import { createRoot } from 'react-dom'`)).toEqual(['react-dom'])
    expect(judged(`import { CARD_WRAPPER_NODES } from '@kobato/inkling-internal/nodes/cards/card-wrappers'`)).toEqual([
      '@kobato/inkling-internal/nodes/cards/card-wrappers',
    ])
    expect(judged(`import { decorateCard } from '@kobato/inkling-internal/nodes/decorate-card'`)).toEqual([
      '@kobato/inkling-internal/nodes/decorate-card',
    ])
    expect(judged(`import InklingCardWrapper from '@kobato/inkling-internal/components/InklingCardWrapper'`)).toEqual([
      '@kobato/inkling-internal/components/InklingCardWrapper',
    ])
    expect(judged(`import { useX } from '@kobato/inkling-internal/hooks/x'`)).toEqual([
      '@kobato/inkling-internal/hooks/x',
    ])
    expect(judged(`import { XPlugin } from '@kobato/inkling-internal/plugins/x'`)).toEqual([
      '@kobato/inkling-internal/plugins/x',
    ])

    expect(judged(`import { AudioNode } from '../AudioNode'`)).toEqual(['../AudioNode'])
    expect(judged(`import { renderHeaderCard } from '../header/HeaderNodeComponent'`)).toEqual([
      '../header/HeaderNodeComponent',
    ])

    expect(judged(`import '@kobato/inkling-internal/nodes/AudioNode'`)).toEqual([
      '@kobato/inkling-internal/nodes/AudioNode',
    ])
    expect(judged(`const m = await import('@kobato/inkling-internal/nodes/AudioNode')`)).toEqual([
      '@kobato/inkling-internal/nodes/AudioNode',
    ])

    expect(judged(`import type { AudioNode } from '@kobato/inkling-internal/nodes/AudioNode'`)).toEqual([])
    expect(judged(`import { type AudioNode } from '@kobato/inkling-internal/nodes/AudioNode'`)).toEqual([])
    expect(judged(`import { type AudioData, AudioNode } from '@kobato/inkling-internal/nodes/AudioNode'`)).toEqual([
      '@kobato/inkling-internal/nodes/AudioNode',
    ])

    expect(judged(`import { BaseAudioNode } from '@kobato/inkling-internal/nodes/base/nodes/audio/AudioNode'`)).toEqual(
      [],
    )
    expect(judged(`import MINIMAL_NODES from '@kobato/inkling-internal/nodes/MinimalNodes'`)).toEqual([])
    expect(judged(`import BASIC_NODES from '@kobato/inkling-internal/nodes/BasicNodes'`)).toEqual([])
    expect(judged(`import { captionEditorSpec } from './caption-editor-spec'`)).toEqual([])
    expect(judged(`import { strOr } from '@kobato/inkling-internal/utils/value-guards'`)).toEqual([])
  })
})
