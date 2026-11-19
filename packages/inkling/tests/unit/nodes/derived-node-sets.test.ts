import type { Transformer } from '@lexical/markdown'

import { DEFAULT_HTML_NODES } from '@kobato/inkling-internal/html/default-html-nodes'
// Import the public barrel first: it is the package/demo entry point, so the
// module graph evaluates in the same order as in the app. Defensive: registry
// modules imported before it could observe wrapper classes mid-cycle as
// `undefined` if a wrapper→barrel edge is ever reintroduced.
import '@kobato/inkling-internal/index'
import { CARD_TRANSFORMERS, MARKDOWN_NODES } from '@kobato/inkling-internal/markdown/round-trip'
import { DEFAULT_BASE_NODES } from '@kobato/inkling-internal/nodes/base'
import DEFAULT_NODES from '@kobato/inkling-internal/nodes/DefaultNodes'
import { describe, expect, it } from 'vitest'

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

describe('derived node sets match the pinned literals', () => {
  it('@kobato/inkling-internal/nodes/DefaultNodes (web editor node set)', () => {
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
      'autolink',
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

  it('@kobato/inkling-internal/nodes/base DEFAULT_BASE_NODES (base node set)', () => {
    expect(nodeSetSnapshot(DEFAULT_BASE_NODES)).toEqual([
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

  it('@kobato/inkling-internal/html/default-html-nodes DEFAULT_HTML_NODES', () => {
    expect(nodeSetSnapshot(DEFAULT_HTML_NODES)).toEqual([
      'heading',
      'link',
      'autolink',
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

  it('@kobato/inkling-internal/markdown/round-trip MARKDOWN_NODES', () => {
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

  it('@kobato/inkling-internal/markdown/round-trip CARD_TRANSFORMERS (by card node type)', () => {
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
