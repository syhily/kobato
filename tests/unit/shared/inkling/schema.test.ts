import { describe, expect, it } from 'vitest'

import {
  inklingDocumentSchema,
  safeValidateInklingDocument,
  validateInklingDocument,
  type InklingBlockNode,
  type InklingDocument,
  type InklingInlineNode,
  type InklingNonRecursiveBlockNode,
} from '@/shared/inkling/schema'

function text(value: string): InklingInlineNode {
  return { type: 'text', version: 1, text: value }
}

function emptyParagraph(): InklingBlockNode {
  return { type: 'paragraph', version: 1, children: [] }
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

describe('shared/inkling/schema — accepts the canonical article node set', () => {
  it('parses an empty document', () => {
    const doc = makeDocument([emptyParagraph()])
    expect(() => validateInklingDocument(doc)).not.toThrow()
  })

  it('parses headings h1-h4', () => {
    const doc = makeDocument([
      { type: 'heading', version: 1, tag: 'h1', children: [text('Title')] },
      { type: 'heading', version: 1, tag: 'h2', children: [text('Section')] },
      { type: 'heading', version: 1, tag: 'h3', children: [text('Sub')] },
      { type: 'heading', version: 1, tag: 'h4', children: [text('Deep')] },
    ])
    expect(() => validateInklingDocument(doc)).not.toThrow()
  })

  it('parses quote, list, and listitem', () => {
    const doc = makeDocument([
      {
        type: 'quote',
        version: 1,
        children: [text('Quoted')],
      },
      {
        type: 'list',
        version: 1,
        listType: 'bullet',
        children: [{ type: 'listitem', version: 1, value: 1, children: [text('Item')] }],
      },
    ])
    expect(() => validateInklingDocument(doc)).not.toThrow()
  })

  it('parses inline link and inline math', () => {
    const doc = makeDocument([
      {
        type: 'paragraph',
        version: 1,
        children: [
          text('See '),
          { type: 'link', version: 1, url: 'https://example.com', children: [text('docs')] },
          { type: 'inline-math', version: 1, tex: 'E=mc^2' },
        ],
      },
    ])
    expect(() => validateInklingDocument(doc)).not.toThrow()
  })

  it('parses all custom article cards', () => {
    const doc = makeDocument([
      {
        type: 'image-card',
        version: 1,
        src: 'https://cdn.example/path.jpg',
        alt: 'Cover',
        caption: 'A caption',
        layout: 'center',
        width: 1280,
        height: 720,
        thumbhash: 'abc',
        storagePath: 'images/2026/05/cover.jpg',
        imageId: 'img-1',
      },
      { type: 'code-block', version: 1, code: 'const x = 1', language: 'ts', highlightedHtml: '<pre/>' },
      { type: 'math-block', version: 1, tex: 'a^2 + b^2 = c^2', mathml: '<math/>' },
      { type: 'music-card', version: 1, playerId: '7hk2pqrxyzabc012', auto: false, center: true },
      { type: 'horizontal-rule', version: 1 },
    ])
    expect(() => validateInklingDocument(doc)).not.toThrow()
  })

  it('parses solution, two-column, table, and footnote nodes', () => {
    const doc = makeDocument([
      {
        type: 'solution',
        version: 1,
        children: [{ type: 'paragraph', version: 1, children: [text('Therefore x = 1')] }],
      },
      {
        type: 'two-column',
        version: 1,
        left: [{ type: 'paragraph', version: 1, children: [text('Left')] }],
        right: [{ type: 'paragraph', version: 1, children: [text('Right')] }],
      },
      {
        type: 'table',
        version: 1,
        rows: [
          {
            type: 'tablerow',
            version: 1,
            cells: [{ type: 'tablecell', version: 1, isHeader: true, children: [text('Header')] }],
          },
          {
            type: 'tablerow',
            version: 1,
            cells: [{ type: 'tablecell', version: 1, children: [text('Cell')] }],
          },
        ],
      },
      {
        type: 'paragraph',
        version: 1,
        children: [
          {
            type: 'footnote-ref',
            version: 1,
            targetKey: 'fn1',
            refKey: 'fnr1',
            index: 1,
          } as unknown as InklingInlineNode,
        ],
      },
      {
        type: 'footnote-definition',
        version: 1,
        targetKey: 'fn1',
        index: 1,
        children: [{ type: 'paragraph', version: 1, children: [text('Footnote text')] }],
      },
    ])
    expect(() => validateInklingDocument(doc)).not.toThrow()
  })
})

describe('shared/inkling/schema — rejects invalid shapes', () => {
  it('rejects an unknown root _type', () => {
    const bad = {
      _type: 'not-inkling',
      schemaVersion: 1,
      lexicalVersion: '0.45.0',
      root: { type: 'root', version: 1, children: [] },
    }
    expect(safeValidateInklingDocument(bad).ok).toBe(false)
  })

  it('rejects a missing schemaVersion', () => {
    const bad = { _type: 'inkling', lexicalVersion: '0.45.0', root: { type: 'root', version: 1, children: [] } }
    expect(safeValidateInklingDocument(bad).ok).toBe(false)
  })

  it('rejects h5 headings', () => {
    const bad = makeDocument([
      { type: 'heading', version: 1, tag: 'h5' as 'h1', children: [text('x')] } as InklingBlockNode,
    ])
    expect(safeValidateInklingDocument(bad).ok).toBe(false)
  })

  it('rejects unknown block types', () => {
    const bad = makeDocument([{ type: 'unknown-block', version: 1 } as unknown as InklingBlockNode])
    expect(safeValidateInklingDocument(bad).ok).toBe(false)
  })

  it('rejects an image card missing src', () => {
    const bad = makeDocument([{ type: 'image-card', version: 1 } as unknown as InklingBlockNode])
    expect(safeValidateInklingDocument(bad).ok).toBe(false)
  })

  it('rejects nested solutions (one-deep recursion guard)', () => {
    const bad = makeDocument([
      {
        type: 'solution',
        version: 1,
        children: [
          { type: 'solution', version: 1, children: [emptyParagraph()] } as unknown as InklingNonRecursiveBlockNode,
        ],
      },
    ])
    expect(safeValidateInklingDocument(bad).ok).toBe(false)
  })

  it('rejects footnote definitions inside a two-column', () => {
    const bad = makeDocument([
      {
        type: 'two-column',
        version: 1,
        left: [
          {
            type: 'footnote-definition',
            version: 1,
            targetKey: 'fn1',
            index: 1,
            children: [emptyParagraph()],
          } as unknown as InklingNonRecursiveBlockNode,
        ],
        right: [],
      },
    ])
    expect(safeValidateInklingDocument(bad).ok).toBe(false)
  })
})
