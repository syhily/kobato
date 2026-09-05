import { describe, expect, it } from 'vitest'

import type { LexicalNodeJson } from '@/shared/lexical/schema'

import {
  convertCommentBody,
  convertPortableTextBody,
  UnmappedConstructError,
} from '@/server/domains/pt/services/pt-to-lexical'
import { commentBodySchema } from '@/shared/pt/comment-schema'
import { portableTextBodySchema, type PortableTextBody } from '@/shared/pt/schema'

// The bespoke PT→Lexical converter (R15): every construct maps explicitly or
// fails the row. The injected fragment renderer is stubbed (`<stub>` markers)
// except where the captured fragment nodes themselves are asserted.

function pt(body: unknown[]): PortableTextBody {
  return portableTextBodySchema.parse(body)
}

function span(text: string, marks?: string[]) {
  return {
    _type: 'span' as const,
    _key: Math.random().toString(36).slice(2, 10),
    text,
    ...(marks === undefined ? {} : { marks }),
  }
}

function block(children: ReturnType<typeof span>[], extra: Record<string, unknown> = {}) {
  return { _type: 'block' as const, _key: Math.random().toString(36).slice(2, 10), children, ...extra }
}

const stubRender = (children: LexicalNodeJson[]): Promise<string> => Promise.resolve(`<stub>${children.length}</stub>`)

async function convert(body: unknown[]) {
  return convertPortableTextBody(pt(body), { renderFragmentHtml: stubRender })
}

type AnyNode = Record<string, unknown>

describe('pt/services/pt-to-lexical — text blocks', () => {
  it('maps normal/headings/blockquote styles and paragraph alignment', async () => {
    const { state } = await convert([
      block([span('plain')]),
      block([span('explicit')], { style: 'normal' }),
      block([span('h2 title')], { style: 'h2' }),
      block([span('h4 title')], { style: 'h4' }),
      block([span('quoted')], { style: 'blockquote' }),
      block([span('right')], { align: 'right' }),
    ])
    const [p1, p2, h2, h4, quote, right] = state.root.children as AnyNode[]
    expect(p1!.type).toBe('paragraph')
    expect(p2!.type).toBe('paragraph')
    expect(h2).toMatchObject({ type: 'extended-heading', tag: 'h2' })
    expect(h4).toMatchObject({ type: 'extended-heading', tag: 'h4' })
    expect(quote!.type).toBe('extended-quote')
    expect(right).toMatchObject({ type: 'paragraph', format: 'right' })
    expect(p1).toMatchObject({ direction: 'ltr', format: '', indent: 0 })
  })

  it('maps decorators to the Lexical text format bitmask', async () => {
    const { state } = await convert([
      block([
        span('plain'),
        span('bold', ['strong']),
        span('italic', ['em']),
        span('strike', ['strike-through']),
        span('under', ['underline']),
        span('mono', ['code']),
        span('bold+italic+code', ['strong', 'em', 'code']),
      ]),
    ])
    const para = state.root.children[0] as AnyNode
    const formats = (para.children as AnyNode[]).map((node) => node.format)
    expect(formats).toEqual([0, 1, 2, 4, 8, 16, 1 | 2 | 16])
  })

  it('splits span text on \\n into linebreak nodes (PT hard breaks)', async () => {
    const { state } = await convert([block([span('a\nb\n'), span('c')])])
    const types = ((state.root.children[0] as AnyNode).children as AnyNode[]).map((node) =>
      node.type === 'extended-text' ? `text:${String(node.text)}` : node.type,
    )
    expect(types).toEqual(['text:a', 'linebreak', 'text:b', 'linebreak', 'text:c'])
  })
})

describe('pt/services/pt-to-lexical — markDefs', () => {
  it('folds a consecutive same-key link run into one link node', async () => {
    const { state } = await convert([
      block([span('see '), span('the', ['lnk']), span(' docs', ['lnk']), span('!')], {
        markDefs: [{ _type: 'link', _key: 'lnk', href: 'https://example.com', rel: 'nofollow', target: '_blank' }],
      }),
    ])
    const children = (state.root.children[0] as AnyNode).children as AnyNode[]
    expect(children.map((node) => node.type)).toEqual(['extended-text', 'link', 'extended-text'])
    expect(children[1]).toMatchObject({ url: 'https://example.com', rel: 'nofollow', target: '_blank', title: null })
    expect((children[1]!.children as AnyNode[]).map((node) => node.text)).toEqual(['the', ' docs'])
  })

  it('defaults link rel/target to null when absent', async () => {
    const { state } = await convert([
      block([span('x', ['lnk'])], { markDefs: [{ _type: 'link', _key: 'lnk', href: 'https://example.com' }] }),
    ])
    expect(((state.root.children[0] as AnyNode).children as AnyNode[])[0]).toMatchObject({ rel: null, target: null })
  })

  it('maps mathInline to a math-inline node and drops the span tex-source text', async () => {
    const { state, stats } = await convert([
      block([span('before '), span('a+b', ['mi']), span(' after')], {
        markDefs: [{ _type: 'mathInline', _key: 'mi', tex: 'a+b', mathml: '<math/>' }],
      }),
    ])
    const children = (state.root.children[0] as AnyNode).children as AnyNode[]
    expect(children.map((node) => node.type)).toEqual(['extended-text', 'math-inline', 'extended-text'])
    // The artifact slots are server-owned: conversion leaves them empty for
    // the prerender pass.
    expect(children[1]).toMatchObject({ tex: 'a+b', mathml: '', svg: '' })
    expect(stats.markDefTypes).toEqual({ mathInline: 1 })
  })

  it('maps footnoteRef to a footnote-ref text node carrying the 1-based index', async () => {
    const { state } = await convert([
      block([span('claim'), span('1', ['fr'])], {
        markDefs: [{ _type: 'footnoteRef', _key: 'fr', targetKey: 'def1', index: 1 }],
      }),
      { _type: 'footnoteDefinition', _key: 'def1', index: 1, children: [block([span('note')])] },
    ])
    const para = state.root.children[0] as AnyNode
    const ref = (para.children as AnyNode[])[1]!
    expect(ref).toMatchObject({ type: 'footnote-ref', text: '1', targetKey: 'def1', format: 0 })
  })

  it('counts orphan footnote refs without failing the row', async () => {
    const { stats } = await convert([
      block([span('x'), span('2', ['fr'])], {
        markDefs: [{ _type: 'footnoteRef', _key: 'fr', targetKey: 'gone', index: 2 }],
      }),
    ])
    expect(stats.orphanFootnoteRefs).toBe(1)
  })

  it('fails the row on a dangling mark (no decorator, no markDef)', async () => {
    await expect(convert([block([span('x', ['nonexistent'])])])).rejects.toThrow(UnmappedConstructError)
    const error = await convert([block([span('x', ['nonexistent'])])]).catch((e: unknown) => e)
    expect((error as UnmappedConstructError).constructs).toEqual(['dangling-mark:nonexistent'])
  })

  it('fails the row on a span carrying two markDef references', async () => {
    const body = [
      block([span('x', ['a', 'b'])], {
        markDefs: [
          { _type: 'link', _key: 'a', href: 'https://a.example' },
          { _type: 'link', _key: 'b', href: 'https://b.example' },
        ],
      }),
    ]
    const error = await convert(body).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(UnmappedConstructError)
    expect((error as UnmappedConstructError).constructs).toContain('multi-markdef-span')
  })
})

describe('pt/services/pt-to-lexical — lists', () => {
  it('nests listItem levels as list > listitem > list', async () => {
    const { state } = await convert([
      block([span('one')], { listItem: 'number', level: 1 }),
      block([span('two')], { listItem: 'number', level: 1 }),
      block([span('two.a')], { listItem: 'number', level: 2 }),
      block([span('three')], { listItem: 'number', level: 1 }),
    ])
    const list = state.root.children[0] as AnyNode
    expect(list).toMatchObject({ type: 'list', listType: 'number', tag: 'ol', start: 1 })
    const items = list.children as AnyNode[]
    expect(items).toHaveLength(3)
    expect(items.map((item) => item.value)).toEqual([1, 2, 3])
    const nestedList = (items[1]!.children as AnyNode[]).find((node) => node.type === 'list')
    expect(nestedList).toBeDefined()
    expect(((nestedList!.children as AnyNode[])[0]!.children as AnyNode[])[0]).toMatchObject({ text: 'two.a' })
  })

  it('ends the streak when the level-1 kind changes', async () => {
    const { state } = await convert([
      block([span('a')], { listItem: 'bullet', level: 1 }),
      block([span('b')], { listItem: 'number', level: 1 }),
    ])
    expect(state.root.children.map((node) => (node as AnyNode).listType)).toEqual(['bullet', 'number'])
  })

  it('synthesizes an empty parent item for a missing intermediate level', async () => {
    const { state } = await convert([
      block([span('top')], { listItem: 'bullet', level: 1 }),
      block([span('deep')], { listItem: 'bullet', level: 3 }),
    ])
    const list = state.root.children[0] as AnyNode
    const firstItem = (list.children as AnyNode[])[0]!
    const level2 = (firstItem.children as AnyNode[]).find((node) => node.type === 'list')!
    const synthParent = (level2.children as AnyNode[])[0]!
    expect(synthParent.children as AnyNode[]).toHaveLength(1)
    const level3 = (synthParent.children as AnyNode[])[0]!
    expect(level3.type).toBe('list')
    expect(((level3.children as AnyNode[])[0]!.children as AnyNode[])[0]!).toMatchObject({ text: 'deep' })
  })
})

describe('pt/services/pt-to-lexical — object blocks', () => {
  it('maps all nine image fields, escaping the plain-text caption into HTML', async () => {
    const { state } = await convert([
      {
        _type: 'image',
        _key: 'i1',
        src: '/storage/posts/a.png',
        alt: 'cover',
        caption: 'a <b>bold</b> caption',
        layout: 'left',
        width: 800,
        height: 600,
        thumbhash: 'th',
        storagePath: 'posts/a.png',
        imageId: 'img1',
      },
    ])
    expect(state.root.children[0]).toMatchObject({
      type: 'image',
      src: '/storage/posts/a.png',
      alt: 'cover',
      caption: 'a &lt;b&gt;bold&lt;/b&gt; caption',
      layout: 'left',
      width: 800,
      height: 600,
      thumbhash: 'th',
      storagePath: 'posts/a.png',
      imageId: 'img1',
      cardWidth: 'regular',
      title: '',
      href: '',
    })
  })

  it('fills image defaults for absent optional fields', async () => {
    const { state } = await convert([{ _type: 'image', _key: 'i1', src: 'https://x.example/a.png' }])
    expect(state.root.children[0]).toMatchObject({
      caption: '',
      alt: '',
      width: null,
      height: null,
      thumbhash: '',
      storagePath: '',
      imageId: '',
      layout: 'center',
    })
  })

  it('maps code/mathBlock/horizontalRule with empty server artifact slots', async () => {
    const { state } = await convert([
      { _type: 'code', _key: 'c1', code: 'const a = 1', language: 'ts', highlightedHtml: '<old/>' },
      { _type: 'mathBlock', _key: 'm1', tex: 'x^2', mathml: '<old/>', svg: '<old/>' },
      { _type: 'horizontalRule', _key: 'h1' },
    ])
    // Server-owned artifacts are re-derived by the prerender, never carried.
    expect(state.root.children[0]).toMatchObject({
      type: 'codeblock',
      code: 'const a = 1',
      language: 'ts',
      caption: '',
      highlightedHtml: '',
    })
    expect(state.root.children[1]).toMatchObject({ type: 'math', tex: 'x^2', mathml: '', svg: '' })
    expect(state.root.children[2]).toMatchObject({ type: 'horizontalrule' })
  })

  it('maps musicPlayer to a meta-less music-player card and counts dropped auto/center flags', async () => {
    const { state, stats } = await convert([
      { _type: 'musicPlayer', _key: 'm1', playerId: 'p1' },
      { _type: 'musicPlayer', _key: 'm2', playerId: 'p2', auto: true, center: true },
    ])
    expect(state.root.children[0]).toMatchObject({ type: 'music-player', playerId: 'p1' })
    expect(state.root.children[1]).toMatchObject({ type: 'music-player', playerId: 'p2' })
    expect(state.root.children[1]).not.toHaveProperty('auto')
    expect(stats.musicFlagDrops).toBe(1)
  })

  it('maps table cells with headerState COLUMN for the header row and ROW otherwise', async () => {
    const { state } = await convert([
      {
        _type: 'table',
        _key: 't1',
        hasHeaderRow: true,
        rows: [
          {
            _type: 'tableRow',
            _key: 'r1',
            cells: [{ _type: 'tableCell', _key: 'c1', isHeader: true, content: [span('h')] }],
          },
          {
            _type: 'tableRow',
            _key: 'r2',
            cells: [
              { _type: 'tableCell', _key: 'c2', isHeader: true, content: [span('rowhead')] },
              {
                _type: 'tableCell',
                _key: 'c3',
                content: [span('linked', ['l1'])],
                markDefs: [{ _type: 'link', _key: 'l1', href: 'https://example.com' }],
              },
            ],
          },
        ],
      },
    ])
    const table = state.root.children[0] as AnyNode
    const [headerRow, bodyRow] = table.children as AnyNode[]
    expect((headerRow!.children as AnyNode[])[0]).toMatchObject({ headerState: 2 })
    expect((bodyRow!.children as AnyNode[])[0]).toMatchObject({ headerState: 1 })
    const linkCell = (bodyRow!.children as AnyNode[])[1]!
    expect(linkCell).toMatchObject({ headerState: 0 })
    const link = ((linkCell.children as AnyNode[])[0]!.children as AnyNode[])[0]!
    expect(link).toMatchObject({ type: 'link', url: 'https://example.com' })
  })
})

describe('pt/services/pt-to-lexical — host cards', () => {
  it('converts solution nested blocks to a card dataset via the injected renderer', async () => {
    const { state, fragments } = await convertPortableTextBody(
      pt([{ _type: 'solution', _key: 's1', children: [block([span('answer')])] }]),
      {
        renderFragmentHtml: (children) => {
          const firstType = (children[0] as AnyNode | undefined)?.type
          return Promise.resolve(`<p>${typeof firstType === 'string' ? firstType : 'none'}</p>`)
        },
      },
    )
    expect(state.root.children[0]).toMatchObject({ type: 'solution', content: '<p>paragraph</p>' })
    expect(fragments).toHaveLength(1)
    expect(fragments[0]).toMatchObject({ container: 'solution', key: 's1' })
    expect(fragments[0]!.ptBlocks).toHaveLength(1)
    expect((fragments[0]!.nodes[0] as AnyNode).type).toBe('paragraph')
  })

  it('converts twoColumn panes independently', async () => {
    const { state, fragments } = await convert([
      {
        _type: 'twoColumn',
        _key: 'tc',
        left: [block([span('L')])],
        right: [{ _type: 'image', _key: 'i', src: '/x.png' }],
      },
    ])
    expect(state.root.children[0]).toMatchObject({
      type: 'two-column',
      left: '<stub>1</stub>',
      right: '<stub>1</stub>',
    })
    expect(fragments.map((f) => f.side)).toEqual(['left', 'right'])
  })

  it('appends footnoteDefinition cards at the document end regardless of source position', async () => {
    const { state } = await convert([
      { _type: 'footnoteDefinition', _key: 'd1', index: 1, children: [block([span('note')])] },
      block([span('tail')]),
    ])
    expect(state.root.children.map((node) => node.type)).toEqual(['paragraph', 'footnotedefinition'])
    expect(state.root.children[1]).toMatchObject({ targetKey: 'd1', index: 1, content: '<stub>1</stub>' })
  })

  it('renders an empty nested run as an empty dataset string', async () => {
    const { state } = await convert([{ _type: 'solution', _key: 's1', children: [] }])
    expect(state.root.children[0]).toMatchObject({ type: 'solution', content: '' })
  })
})

describe('pt/services/pt-to-lexical — stats', () => {
  it('counts every visited construct, nested included', async () => {
    const { stats } = await convert([
      block([span('a', ['strong'])]),
      { _type: 'solution', _key: 's', children: [block([span('x')]), { _type: 'mathBlock', _key: 'm', tex: 'y' }] },
    ])
    expect(stats.blockTypes).toEqual({ block: 2, solution: 1, mathBlock: 1 })
    expect(stats.decoratorMarks).toEqual({ strong: 1 })
    expect(stats.nestedBlockTypes).toEqual({ solution: { block: 1, mathBlock: 1 } })
  })
})

describe('pt/services/pt-to-lexical — comments', () => {
  it('converts the restricted comment surface and validates against the comment schema', () => {
    const body = commentBodySchema.parse([
      block([span('hi '), span('there', ['strong'])]),
      block([span('q')], { style: 'blockquote' }),
      block([span('item')], { listItem: 'bullet', level: 1 }),
      { _type: 'code', _key: 'c', code: 'x()', language: 'ts' },
      { _type: 'mathBlock', _key: 'm', tex: 'x' },
      block([span('l', ['k'])], { markDefs: [{ _type: 'link', _key: 'k', href: 'https://example.com' }] }),
    ])
    const { state, stats } = convertCommentBody(body)
    expect(state.root.children.map((node) => node.type)).toEqual([
      'paragraph',
      'extended-quote',
      'list',
      'codeblock',
      'math',
      'paragraph',
    ])
    expect(stats.blockTypes.block).toBe(4)
  })
})
