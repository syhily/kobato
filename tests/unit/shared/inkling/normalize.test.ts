import { describe, expect, it } from 'vitest'

import type { InklingBlockNode, InklingDocument, InklingInlineNode } from '@/shared/inkling/schema'

import { EMPTY_INKLING_DOCUMENT } from '@/shared/inkling/empty'
import {
  areInklingDocumentsEquivalent,
  inklingDocumentFingerprint,
  normalizeInklingDocument,
} from '@/shared/inkling/normalize'

function text(value: string): InklingInlineNode {
  return { type: 'text', version: 1, text: value }
}

function makeDocument(rootChildren: InklingBlockNode[]): InklingDocument {
  return {
    _type: 'inkling',
    schemaVersion: 1,
    lexicalVersion: '0.45.0',
    root: {
      type: 'root',
      version: 1,
      direction: null,
      format: '',
      indent: 0,
      children: rootChildren,
    },
  }
}

describe('shared/inkling/normalize — strips transient fields', () => {
  it('drops generated node keys', () => {
    const doc = makeDocument([{ type: 'paragraph', version: 1, key: 'abc123', children: [text('Hello')] }])
    const normalized = normalizeInklingDocument(doc)
    expect(normalized.root.children[0]).not.toHaveProperty('key')
  })

  it('drops selection state', () => {
    const doc = makeDocument([{ type: 'paragraph', version: 1, children: [] }])
    ;(doc as unknown as { selection: string }).selection = '{"anchor":{}}'
    const normalized = normalizeInklingDocument(doc)
    expect(normalized).not.toHaveProperty('selection')
  })

  it('drops prerender artifacts by default', () => {
    const doc = makeDocument([
      { type: 'code-block', version: 1, code: 'x', highlightedHtml: '<pre>old</pre>' },
      { type: 'math-block', version: 1, tex: 'x', mathml: '<math>old</math>' },
    ])
    const normalized = normalizeInklingDocument(doc)
    expect(normalized.root.children[0]).not.toHaveProperty('highlightedHtml')
    expect(normalized.root.children[1]).not.toHaveProperty('mathml')
  })

  it('can preserve prerender artifacts when requested', () => {
    const doc = makeDocument([{ type: 'code-block', version: 1, code: 'x', highlightedHtml: '<pre>old</pre>' }])
    const normalized = normalizeInklingDocument(doc, { stripPrerenderArtifacts: false })
    expect(normalized.root.children[0]).toHaveProperty('highlightedHtml')
  })
})

describe('shared/inkling/normalize — semantic equivalence', () => {
  it('considers documents with different keys equivalent', () => {
    const a = makeDocument([{ type: 'paragraph', version: 1, key: 'a', children: [text('Hello')] }])
    const b = makeDocument([{ type: 'paragraph', version: 1, key: 'b', children: [text('Hello')] }])
    expect(areInklingDocumentsEquivalent(a, b)).toBe(true)
  })

  it('considers documents with different highlightedHtml equivalent', () => {
    const a = makeDocument([{ type: 'code-block', version: 1, code: 'x', highlightedHtml: '<pre>a</pre>' }])
    const b = makeDocument([{ type: 'code-block', version: 1, code: 'x', highlightedHtml: '<pre>b</pre>' }])
    expect(areInklingDocumentsEquivalent(a, b)).toBe(true)
  })

  it('distinguishes documents with different content', () => {
    const a = makeDocument([{ type: 'paragraph', version: 1, children: [text('Hello')] }])
    const b = makeDocument([{ type: 'paragraph', version: 1, children: [text('World')] }])
    expect(areInklingDocumentsEquivalent(a, b)).toBe(false)
  })

  it('produces identical fingerprints for equivalent documents', () => {
    const a = makeDocument([{ type: 'paragraph', version: 1, key: 'x', children: [text('Hello')] }])
    const b = makeDocument([{ type: 'paragraph', version: 1, key: 'y', children: [text('Hello')] }])
    expect(inklingDocumentFingerprint(a)).toBe(inklingDocumentFingerprint(b))
  })

  it('normalizes the empty document without errors', () => {
    expect(() => normalizeInklingDocument(EMPTY_INKLING_DOCUMENT)).not.toThrow()
  })
})
