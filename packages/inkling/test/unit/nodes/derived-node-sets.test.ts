import type { Transformer } from '@lexical/markdown'

import { describe, expect, it } from 'vitest'

// Import the public barrel first: it is the package/demo entry point, so the
// module graph evaluates in the same order as in the app. Defensive: registry
// modules imported before it could observe wrapper classes mid-cycle as
// `undefined` if a wrapper→barrel edge is ever reintroduced.
import '@/index'
import { DEFAULT_HTML_NODES } from '@/html/default-html-nodes'
import { CARD_TRANSFORMERS, MARKDOWN_NODES } from '@/markdown/round-trip'
import { DEFAULT_NODES as BASE_DEFAULT_NODES } from '@/nodes/base'
import DEFAULT_NODES from '@/nodes/DefaultNodes'

// Node-set entries are either node classes or Lexical replacement descriptors
// ({ replace, with }). Pin both, marking replacements so the two forms can
// never be confused for each other.
function nodeSetSnapshot(nodes: readonly unknown[]): string[] {
  return nodes.map((entry) => {
    if (typeof entry === 'function' && 'getType' in entry && typeof entry.getType === 'function') {
      return entry.getType()
    }
    if (entry && typeof entry === 'object' && 'replace' in entry) {
      const { replace } = entry
      if (typeof replace === 'function' && 'getType' in replace && typeof replace.getType === 'function') {
        return `replace:${replace.getType()}`
      }
    }
    return 'undefined'
  })
}

// A card transformer is pinned by the node types it depends on (exactly one
// card node class per transformer today).
function transformerSnapshot(transformers: readonly Transformer[]): string[] {
  return transformers.map((transformer) => {
    if (!('dependencies' in transformer) || !Array.isArray(transformer.dependencies)) {
      return ''
    }
    return transformer.dependencies
      .map((nodeClass) =>
        typeof nodeClass === 'function' && 'getType' in nodeClass && typeof nodeClass.getType === 'function'
          ? nodeClass.getType()
          : '',
      )
      .join(',')
  })
}

// Node-set drift guard. These literals pin the derived registries — every
// registry is a derived view over the card declarations, composed in
// declaration order (registration order carries no runtime semantics: node
// types are unique and replacements ride the named pairs). The literals
// guard against DRIFT from declaration order, not against history — when a
// card is added or reordered in the declarations, update the literals to
// the new derived order.
describe('derived node sets match the pinned literals', () => {
  it('@/nodes/DefaultNodes (web editor node set)', () => {
    expect(nodeSetSnapshot(DEFAULT_NODES)).toEqual([
      'extended-text',
      'replace:text',
      'heading',
      'extended-heading',
      'replace:heading',
      'quote',
      'extended-quote',
      'replace:quote',
      'list',
      'listitem',
      'aside',
      'link',
      'table',
      'tablerow',
      'tablecell',
      'codeblock',
      'horizontalrule',
      'image',
      'audio',
      'video',
      'callout',
      'html',
      'file',
      'button',
      'toggle',
      'header',
      'bookmark',
      'gallery',
      'math',
      'footnotedefinition',
      'tk',
      'at-link',
      'at-link-search',
      'zwnj',
      'math-inline',
      'footnote-ref',
    ])
  })

  it('@/nodes/base DEFAULT_NODES (base node set)', () => {
    expect(nodeSetSnapshot(BASE_DEFAULT_NODES)).toEqual([
      'extended-text',
      'replace:text',
      'extended-heading',
      'replace:heading',
      'extended-quote',
      'replace:quote',
      'markdown',
      'aside',
      'codeblock',
      'horizontalrule',
      'image',
      'audio',
      'video',
      'callout',
      'html',
      'file',
      'button',
      'toggle',
      'header',
      'bookmark',
      'gallery',
      'math',
      'footnotedefinition',
      'tk',
      'at-link',
      'at-link-search',
      'zwnj',
      'math-inline',
      'footnote-ref',
    ])
  })

  it('@/html/default-html-nodes DEFAULT_HTML_NODES', () => {
    expect(nodeSetSnapshot(DEFAULT_HTML_NODES)).toEqual([
      'heading',
      'link',
      'listitem',
      'list',
      'quote',
      'extended-text',
      'replace:text',
      'extended-heading',
      'replace:heading',
      'extended-quote',
      'replace:quote',
      'markdown',
      'aside',
      'codeblock',
      'horizontalrule',
      'image',
      'audio',
      'video',
      'callout',
      'html',
      'file',
      'button',
      'toggle',
      'header',
      'bookmark',
      'gallery',
      'math',
      'footnotedefinition',
      'tk',
      'at-link',
      'at-link-search',
      'zwnj',
      'math-inline',
      'footnote-ref',
      'table',
      'tablerow',
      'tablecell',
    ])
  })

  it('@/markdown/round-trip MARKDOWN_NODES', () => {
    expect(nodeSetSnapshot(MARKDOWN_NODES)).toEqual([
      'heading',
      'quote',
      'list',
      'listitem',
      'link',
      'table',
      'tablerow',
      'tablecell',
      'codeblock',
      'horizontalrule',
      'image',
      'audio',
      'video',
      'callout',
      'html',
      'file',
      'button',
      'toggle',
      'bookmark',
      'gallery',
      'markdown',
    ])
  })

  it('@/markdown/round-trip CARD_TRANSFORMERS (by card node type)', () => {
    expect(transformerSnapshot(CARD_TRANSFORMERS)).toEqual([
      'image',
      'audio',
      'video',
      'callout',
      'html',
      'file',
      'button',
      'toggle',
      'bookmark',
      'gallery',
      'markdown',
    ])
  })
})
