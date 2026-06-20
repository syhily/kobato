// Parity guard for the NestedEditor's local NESTED_ARTICLE_NODES.
//
// NestedEditor.tsx defines its own local copy of the node set (instead of
// importing from nodes/registry.ts) to break a circular dependency
// (registry → layout-card-nodes → NestedEditor → registry). This test pins
// the expected set so any accidental addition/removal is caught before it
// reaches production.

import { describe, expect, it } from 'vitest'

import { NESTED_ARTICLE_NODES } from '@/ui/inkling/editor/nested/NestedEditor'

// NESTED_ARTICLE_NODES is typed as InitialConfigType['nodes'] which is a
// union including LexicalNodeReplacement. In practice every entry is a node
// class (no replacements), so we narrow via `unknown` for the getType() call.
type NodeClass = { getType(): string }
const nodeClasses = NESTED_ARTICLE_NODES as unknown as NodeClass[]

function nodeTypes(): string[] {
  return nodeClasses.map((Node) => Node.getType())
}

describe('NestedEditor NESTED_ARTICLE_NODES parity', () => {
  it('contains exactly the expected 12 node types', () => {
    const types = nodeTypes().sort()
    expect(types).toEqual(
      [
        'code-block',
        'heading',
        'horizontal-rule',
        'image-card',
        'list',
        'listitem',
        'math-block',
        'paragraph',
        'quote',
        'link',
        'inline-math',
        'table',
      ].sort(),
    )
  })

  it('does NOT include recursive containers or article-only nodes', () => {
    const types = new Set(nodeTypes())
    // These would cause infinite nesting or are not allowed in nested editors:
    expect(types.has('solution')).toBe(false)
    expect(types.has('two-column')).toBe(false)
    expect(types.has('footnote-ref')).toBe(false)
    expect(types.has('music-card')).toBe(false)
    expect(types.has('footnote-definition')).toBe(false)
  })
})
