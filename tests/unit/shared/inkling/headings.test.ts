import { describe, expect, it } from 'vitest'

import type { InklingBlockNode, InklingDocument, InklingInlineNode } from '@/shared/inkling/schema'

import { collectInklingHeadings } from '@/shared/inkling/headings'

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

describe('shared/inkling/headings — render order', () => {
  it('walks solution innards before later top-level blocks', () => {
    const doc = makeDocument([
      { type: 'heading', version: 1, tag: 'h2', children: [text('A')] },
      {
        type: 'solution',
        version: 1,
        children: [{ type: 'heading', version: 1, tag: 'h3', children: [text('B')] }],
      },
      { type: 'heading', version: 1, tag: 'h2', children: [text('C')] },
    ])
    expect(collectInklingHeadings(doc).map((h) => h.text)).toEqual(['A', 'B', 'C'])
  })

  it('walks two-column left then right before later top-level blocks', () => {
    const doc = makeDocument([
      { type: 'heading', version: 1, tag: 'h2', children: [text('Outer')] },
      {
        type: 'two-column',
        version: 1,
        left: [{ type: 'heading', version: 1, tag: 'h3', children: [text('Left col')] }],
        right: [{ type: 'heading', version: 1, tag: 'h3', children: [text('Right col')] }],
      },
      { type: 'heading', version: 1, tag: 'h2', children: [text('After')] },
    ])
    expect(collectInklingHeadings(doc).map((h) => h.text)).toEqual(['Outer', 'Left col', 'Right col', 'After'])
  })

  it('places footnote definition headings after the main column', () => {
    const doc = makeDocument([
      { type: 'heading', version: 1, tag: 'h2', children: [text('Main')] },
      {
        type: 'footnote-definition',
        version: 1,
        targetKey: 'fn1',
        index: 1,
        children: [{ type: 'heading', version: 1, tag: 'h3', children: [text('Note')] }],
      },
    ])
    expect(collectInklingHeadings(doc).map((h) => h.text)).toEqual(['Main', 'Note'])
  })
})

describe('shared/inkling/headings — slug generation', () => {
  it('emits depth, text, and slug', () => {
    const doc = makeDocument([{ type: 'heading', version: 1, tag: 'h2', children: [text('Hello World')] }])
    expect(collectInklingHeadings(doc)).toEqual([{ depth: 2, text: 'Hello World', slug: 'hello-world' }])
  })

  it('applies the optional transform before slugging', () => {
    const doc = makeDocument([{ type: 'heading', version: 1, tag: 'h1', children: [text('Hello')] }])
    expect(collectInklingHeadings(doc, () => 'transformed')[0]!.slug).toBe('transformed')
  })

  it('deduplicates identical slugs', () => {
    const doc = makeDocument([
      { type: 'heading', version: 1, tag: 'h2', children: [text('Same')] },
      { type: 'heading', version: 1, tag: 'h2', children: [text('Same')] },
    ])
    expect(collectInklingHeadings(doc).map((h) => h.slug)).toEqual(['same', 'same-1'])
  })

  it('ignores non-heading blocks', () => {
    const doc = makeDocument([
      { type: 'paragraph', version: 1, children: [text('paragraph')] },
      { type: 'quote', version: 1, children: [text('quote')] },
    ])
    expect(collectInklingHeadings(doc)).toEqual([])
  })

  it('does not let preceding paragraph text leak into heading slug', () => {
    const doc = makeDocument([
      { type: 'paragraph', version: 1, children: [text('prior body text')] },
      { type: 'heading', version: 1, tag: 'h2', children: [text('Heading')] },
    ])
    expect(collectInklingHeadings(doc).map((h) => ({ text: h.text, slug: h.slug }))).toEqual([
      { text: 'Heading', slug: 'heading' },
    ])
  })
})
