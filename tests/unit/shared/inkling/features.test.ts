import { describe, expect, it } from 'vitest'

import type { InklingBlockNode, InklingDocument, InklingInlineNode } from '@/shared/inkling/schema'

import { validateInklingDocumentForMode } from '@/shared/inkling/features'

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

describe('shared/inkling/features — article mode', () => {
  it('accepts the full article node set', () => {
    const doc = makeDocument([
      { type: 'heading', version: 1, tag: 'h2', children: [text('Section')] },
      { type: 'paragraph', version: 1, children: [text('Body')] },
      { type: 'image-card', version: 1, src: 'https://example.com/x.jpg' },
      { type: 'code-block', version: 1, code: 'x' },
      { type: 'math-block', version: 1, tex: 'x' },
      { type: 'music-card', version: 1, playerId: 'abc123' },
      { type: 'horizontal-rule', version: 1 },
      {
        type: 'table',
        version: 1,
        rows: [{ type: 'tablerow', version: 1, cells: [{ type: 'tablecell', version: 1, children: [text('A')] }] }],
      },
      { type: 'solution', version: 1, children: [{ type: 'paragraph', version: 1, children: [text('Sol')] }] },
      {
        type: 'two-column',
        version: 1,
        left: [{ type: 'paragraph', version: 1, children: [text('L')] }],
        right: [{ type: 'paragraph', version: 1, children: [text('R')] }],
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
        children: [{ type: 'paragraph', version: 1, children: [text('Note')] }],
      },
    ])
    expect(validateInklingDocumentForMode(doc, 'article')).toEqual({ ok: true })
  })
})

describe('shared/inkling/features — comment mode rejects article-only nodes', () => {
  function assertForbidden(node: InklingBlockNode, forbiddenType: string): void {
    const doc = makeDocument([{ type: 'paragraph', version: 1, children: [] }, node])
    const result = validateInklingDocumentForMode(doc, 'comment')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.forbiddenType).toBe(forbiddenType)
    }
  }

  it('rejects heading', () => {
    assertForbidden({ type: 'heading', version: 1, tag: 'h2', children: [text('x')] }, 'heading')
  })

  it('rejects image-card', () => {
    assertForbidden({ type: 'image-card', version: 1, src: 'x' }, 'image-card')
  })

  it('rejects horizontal-rule', () => {
    assertForbidden({ type: 'horizontal-rule', version: 1 }, 'horizontal-rule')
  })

  it('rejects music-card', () => {
    assertForbidden({ type: 'music-card', version: 1, playerId: 'x' }, 'music-card')
  })

  it('rejects table', () => {
    assertForbidden(
      {
        type: 'table',
        version: 1,
        rows: [{ type: 'tablerow', version: 1, cells: [{ type: 'tablecell', version: 1, children: [text('A')] }] }],
      },
      'table',
    )
  })

  it('rejects solution', () => {
    assertForbidden(
      { type: 'solution', version: 1, children: [{ type: 'paragraph', version: 1, children: [] }] },
      'solution',
    )
  })

  it('rejects two-column', () => {
    assertForbidden({ type: 'two-column', version: 1, left: [], right: [] }, 'two-column')
  })

  it('rejects footnote-ref', () => {
    assertForbidden(
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
      } as InklingBlockNode,
      'footnote-ref',
    )
  })

  it('rejects footnote-definition', () => {
    assertForbidden(
      {
        type: 'footnote-definition',
        version: 1,
        targetKey: 'fn1',
        index: 1,
        children: [{ type: 'paragraph', version: 1, children: [] }],
      },
      'footnote-definition',
    )
  })

  it('accepts the full comment node set', () => {
    const doc = makeDocument([
      { type: 'paragraph', version: 1, children: [text('Hello ')] },
      { type: 'quote', version: 1, children: [text('Quoted')] },
      {
        type: 'list',
        version: 1,
        listType: 'bullet',
        children: [{ type: 'listitem', version: 1, value: 1, children: [text('Item')] }],
      },
      {
        type: 'paragraph',
        version: 1,
        children: [
          { type: 'link', version: 1, url: 'https://example.com', children: [text('link')] },
          { type: 'inline-math', version: 1, tex: 'x' },
        ],
      },
      { type: 'code-block', version: 1, code: 'const x = 1' },
      { type: 'math-block', version: 1, tex: 'a^2' },
    ])
    expect(validateInklingDocumentForMode(doc, 'comment')).toEqual({ ok: true })
  })
})
