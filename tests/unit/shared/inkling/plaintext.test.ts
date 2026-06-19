import { describe, expect, it } from 'vitest'

import type { InklingBlockNode, InklingDocument, InklingInlineNode } from '@/shared/inkling/schema'

import { inklingToPlainText } from '@/shared/inkling/plaintext'

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

describe('shared/inkling/plaintext — extracts text from custom nodes', () => {
  it('joins inline spans', () => {
    const doc = makeDocument([{ type: 'paragraph', version: 1, children: [text('Hello '), text('world')] }])
    expect(inklingToPlainText(doc)).toBe('Hello world')
  })

  it('emits code block content', () => {
    const doc = makeDocument([{ type: 'code-block', version: 1, code: 'const x = 1' }])
    expect(inklingToPlainText(doc)).toBe('const x = 1')
  })

  it('emits math block tex', () => {
    const doc = makeDocument([{ type: 'math-block', version: 1, tex: 'a^2 + b^2' }])
    expect(inklingToPlainText(doc)).toBe('a^2 + b^2')
  })

  it('emits inline math tex inside paragraphs', () => {
    const doc = makeDocument([
      { type: 'paragraph', version: 1, children: [text('Eq '), { type: 'inline-math', version: 1, tex: 'x' }] },
    ])
    expect(inklingToPlainText(doc)).toBe('Eq x')
  })

  it('falls back to image alt text and skips images without alt', () => {
    const doc = makeDocument([
      { type: 'image-card', version: 1, src: 'x', alt: 'a cat' },
      { type: 'image-card', version: 1, src: 'y' },
      { type: 'image-card', version: 1, src: 'z', alt: '' },
    ])
    expect(inklingToPlainText(doc)).toBe('a cat')
  })

  it('renders music cards as [Music: playerId]', () => {
    const doc = makeDocument([{ type: 'music-card', version: 1, playerId: 'abc123' }])
    expect(inklingToPlainText(doc)).toBe('[Music: abc123]')
  })

  it('renders horizontal rule as ---', () => {
    const doc = makeDocument([{ type: 'horizontal-rule', version: 1 }])
    expect(inklingToPlainText(doc)).toBe('---')
  })

  it('renders footnote refs with their display index', () => {
    const doc = makeDocument([
      {
        type: 'paragraph',
        version: 1,
        children: [text('see'), { type: 'footnote-ref', version: 1, targetKey: 'a', refKey: 'r1', index: 2 }],
      },
    ])
    expect(inklingToPlainText(doc)).toBe('see2')
  })

  it('preserves prefixes for text after nested lists', () => {
    const doc = makeDocument([
      {
        type: 'list',
        version: 1,
        listType: 'bullet',
        children: [
          {
            type: 'listitem',
            version: 1,
            value: 1,
            children: [
              text('outer'),
              {
                type: 'list',
                version: 1,
                listType: 'number',
                children: [{ type: 'listitem', version: 1, value: 1, children: [text('inner')] }],
              },
              text('after'),
            ],
          },
        ],
      },
    ])
    expect(inklingToPlainText(doc)).toBe('- outer\n1. inner\nafter')
  })

  it('renders table cells separated by newlines', () => {
    const doc = makeDocument([
      {
        type: 'table',
        version: 1,
        rows: [
          {
            type: 'tablerow',
            version: 1,
            cells: [
              { type: 'tablecell', version: 1, children: [text('A')] },
              { type: 'tablecell', version: 1, children: [text('B')] },
            ],
          },
        ],
      },
    ])
    expect(inklingToPlainText(doc)).toBe('A\nB')
  })

  it('descends into solution children', () => {
    const doc = makeDocument([
      {
        type: 'solution',
        version: 1,
        children: [{ type: 'paragraph', version: 1, children: [text('solution text')] }],
      },
    ])
    expect(inklingToPlainText(doc)).toBe('solution text')
  })

  it('descends into two-column left then right', () => {
    const doc = makeDocument([
      {
        type: 'two-column',
        version: 1,
        left: [{ type: 'paragraph', version: 1, children: [text('left')] }],
        right: [{ type: 'paragraph', version: 1, children: [text('right')] }],
      },
    ])
    expect(inklingToPlainText(doc)).toBe('left\nright')
  })

  it('places footnote definitions at the end of the text', () => {
    const doc = makeDocument([
      { type: 'paragraph', version: 1, children: [text('main')] },
      {
        type: 'footnote-definition',
        version: 1,
        targetKey: 'fn1',
        index: 1,
        children: [{ type: 'paragraph', version: 1, children: [text('footnote')] }],
      },
    ])
    expect(inklingToPlainText(doc)).toBe('main\nfootnote')
  })
})
