import type { PortableTextBody, Span, TextBlock } from '@kobato/shared/legacy-pt/schema'
import type {
  LexicalBlockNode,
  LexicalBody,
  LexicalFootnoteDefinitionNode,
  LexicalHeadingNode,
  LexicalInlineNode,
  LexicalListNode,
  LexicalParagraphNode,
  LexicalTableNode,
  LexicalTwoColumnNode,
} from '@kobato/shared/lexical/schema'

import { convertPtBodyToLexical } from '@kobato/editor/lexical-core/mapping'
import { validateLexicalBody } from '@kobato/editor/lexical-core/validate'
import { describe, expect, it } from 'vitest'

// One-way PT → Lexical mapping (§3.1). Input is canonicalised first, so
// the assertions below exercise the mapper on canonical PT (filled list
// levels, renumbered footnotes, defs at the end).

// --- fixture helpers --------------------------------------------------------

function span(text: string, marks?: string[]): Span {
  return { _type: 'span', _key: `s-${text.slice(0, 4)}`, text, ...(marks !== undefined ? { marks } : {}) }
}

function textBlock(
  key: string,
  opts: { style?: string; listItem?: 'bullet' | 'number'; level?: number; align?: string; markDefs?: unknown[] } = {},
  children: Span[] = [span('x')],
): TextBlock {
  return {
    _type: 'block',
    _key: key,
    ...(opts.style !== undefined ? { style: opts.style as TextBlock['style'] } : {}),
    ...(opts.listItem !== undefined ? { listItem: opts.listItem } : {}),
    ...(opts.level !== undefined ? { level: opts.level } : {}),
    ...(opts.align !== undefined ? { align: opts.align as TextBlock['align'] } : {}),
    ...(opts.markDefs !== undefined ? { markDefs: opts.markDefs as never } : {}),
    children,
  }
}

function elementBase(): { direction: null; format: string; indent: 0; version: 1 } {
  return { direction: null, format: '', indent: 0, version: 1 }
}

function paragraph(children: unknown[] = [], format = '') {
  return { ...elementBase(), format, type: 'paragraph' as const, children, textFormat: 0, textStyle: '' }
}

function text(text: string, format = 0) {
  return { detail: 0, format, mode: 'normal' as const, style: '', text, type: 'text' as const, version: 1 as const }
}

function root(children: unknown[]): LexicalBody {
  return { root: { ...elementBase(), type: 'root', children } } as unknown as LexicalBody
}

// --- full-body mapping ------------------------------------------------------

describe('editor/lexical-core/mapping — convertPtBodyToLexical', () => {
  it('maps every block type to its lexical counterpart (full body)', () => {
    const pt: PortableTextBody = [
      textBlock('b-h2', { style: 'h2' }, [span('Title')]),
      textBlock('b-p1', {}, [span('Hello '), span('world', ['strong'])]),
      textBlock('b-p2', { align: 'center' }, [span('See '), span('docs', ['lk-1'])]),
      textBlock('b-quote', { style: 'blockquote' }, [span('quoted')]),
      textBlock('b-li1', { listItem: 'bullet', level: 1 }, [span('item a')]),
      textBlock('b-li2', { listItem: 'bullet', level: 2 }, [span('nested')]),
      textBlock('b-li3', { listItem: 'bullet', level: 1 }, [span('item b')]),
      {
        _type: 'image',
        _key: 'b-img',
        src: 'https://cdn/x.jpg',
        alt: 'Alt',
        width: 1280,
        height: 720,
        storagePath: 'images/x.jpg',
      },
      { _type: 'code', _key: 'b-code', code: 'const a = 1', language: 'ts' },
      { _type: 'mathBlock', _key: 'b-math', tex: 'a^2' },
      { _type: 'horizontalRule', _key: 'b-hr' },
      { _type: 'musicPlayer', _key: 'b-music', playerId: '7hk2pqrxyzabc012', center: true },
      {
        _type: 'table',
        _key: 'b-table',
        hasHeaderRow: true,
        rows: [
          {
            _type: 'tableRow',
            _key: 'r1',
            cells: [
              { _type: 'tableCell', _key: 'c1', content: [span('h1')] },
              { _type: 'tableCell', _key: 'c2', isHeader: true, content: [span('h2')] },
            ],
          },
          { _type: 'tableRow', _key: 'r2', cells: [{ _type: 'tableCell', _key: 'c3', content: [span('d1')] }] },
        ],
      },
      { _type: 'solution', _key: 'b-sol', children: [textBlock('b-sol-p', {}, [span('solution text')])] },
      {
        _type: 'twoColumn',
        _key: 'b-tc',
        left: [textBlock('b-tc-l', {}, [span('L')])],
        right: [textBlock('b-tc-r', {}, [span('R')])],
      },
      { _type: 'footnoteDefinition', _key: 'b-fn', index: 1, children: [textBlock('b-fn-p', {}, [span('note')])] },
    ]
    const linkMarkDefs = [
      { _type: 'link', _key: 'lk-1', href: 'https://example.com', rel: 'nofollow', target: '_blank' },
    ]
    // Wire the link markDef into b-p2 (built above without it).
    const withLink = pt.map((block) =>
      block._key === 'b-p2' ? { ...block, markDefs: linkMarkDefs } : block,
    ) as PortableTextBody

    const mapped = convertPtBodyToLexical(withLink)
    const children = mapped.root.children

    // h2 heading.
    expect(children[0]).toEqual({
      ...elementBase(),
      type: 'heading',
      tag: 'h2',
      children: [text('Title')],
    } satisfies LexicalHeadingNode)

    // Paragraph with a bold segment.
    expect(children[1]).toEqual(paragraph([text('Hello '), text('world', 1)]))

    // Centered paragraph with a link markDef → LinkNode (title null).
    expect(children[2]).toEqual({
      ...elementBase(),
      format: 'center',
      type: 'paragraph',
      children: [
        text('See '),
        {
          ...elementBase(),
          type: 'link',
          url: 'https://example.com',
          rel: 'nofollow',
          target: '_blank',
          title: null,
          children: [text('docs')],
        },
      ],
      textFormat: 0,
      textStyle: '',
    })

    // Blockquote → quote wrapping one paragraph.
    expect(children[3]).toEqual({
      ...elementBase(),
      type: 'quote',
      children: [paragraph([text('quoted')])],
    })

    // Flat bullet streak with a level-2 item → nested list tree.
    const list = children[4] as LexicalListNode
    expect(list).toMatchObject({ type: 'list', listType: 'bullet', start: 1, tag: 'ul' })
    expect(list.children).toHaveLength(2)
    const li1 = list.children[0]!
    const li2 = list.children[1]!
    expect(li1.children[0]).toEqual(paragraph([text('item a')]))
    expect((li1.children[1] as LexicalListNode).listType).toBe('bullet')
    expect((li1.children[1] as LexicalListNode).children[0]!.children[0]).toEqual(paragraph([text('nested')]))
    expect(li2.children[0]).toEqual(paragraph([text('item b')]))

    // Image with ptKey (custom node).
    expect(children[5]).toEqual({
      type: 'image',
      version: 1,
      src: 'https://cdn/x.jpg',
      alt: 'Alt',
      width: 1280,
      height: 720,
      storagePath: 'images/x.jpg',
      ptKey: 'b-img',
    })

    // Code (standard node — no ptKey, highlightedHtml dropped).
    expect(children[6]).toEqual({
      ...elementBase(),
      type: 'code',
      language: 'ts',
      children: [text('const a = 1')],
    })

    // Math block + horizontal rule + music player.
    expect(children[7]).toEqual({ type: 'mathBlock', version: 1, tex: 'a^2', ptKey: 'b-math' })
    expect(children[8]).toEqual({ type: 'horizontalrule', version: 1 })
    expect(children[9]).toEqual({
      type: 'musicPlayer',
      version: 1,
      playerId: '7hk2pqrxyzabc012',
      center: true,
      ptKey: 'b-music',
    })

    // Table: first row headerState 1, isHeader cell 2, plain cell 0.
    const table = children[10] as LexicalTableNode
    expect(table.type).toBe('table')
    const row0 = table.children[0]!
    const row1 = table.children[1]!
    expect(row0.children.map((c) => c.headerState)).toEqual([1, 3])
    expect(row1.children.map((c) => c.headerState)).toEqual([0])
    expect(row0.children[0]!.children[0]).toEqual(paragraph([text('h1')]))

    // Solution recursion.
    expect(children[11]).toMatchObject({ type: 'solution', ptKey: 'b-sol' })
    const solParagraph = (children[11] as { children: LexicalBlockNode[] }).children[0] as LexicalParagraphNode
    expect(solParagraph.children).toEqual([text('solution text')])

    // TwoColumn → two panes.
    const tc = children[12] as LexicalTwoColumnNode
    expect(tc.type).toBe('twoColumn')
    expect(tc.children.map((pane) => pane.side)).toEqual(['left', 'right'])
    expect((tc.children[0]!.children[0] as LexicalParagraphNode).children).toEqual([text('L')])
    expect((tc.children[1]!.children[0] as LexicalParagraphNode).children).toEqual([text('R')])

    // Footnote definition.
    expect(children[13]).toMatchObject({ type: 'footnoteDefinition', index: 1, ptKey: 'b-fn' })
    const fnParagraph = (children[13] as LexicalFootnoteDefinitionNode).children[0] as LexicalParagraphNode
    expect(fnParagraph.children).toEqual([text('note')])

    // The mapped body passes the validation gate.
    expect(() => validateLexicalBody(mapped)).not.toThrow()
  })

  it('maps an empty body to a single empty paragraph', () => {
    const mapped = convertPtBodyToLexical([])
    expect(mapped).toEqual(root([paragraph([])]))
  })

  it('splits hard breaks (embedded \\n) into linebreak nodes', () => {
    const pt: PortableTextBody = [textBlock('b', {}, [span('第一行'), span('\n', ['strong']), span('第二行')])]
    const mapped = convertPtBodyToLexical(pt)
    const p = mapped.root.children[0] as LexicalParagraphNode
    // The strong mark sits on the bare-break span and has no text segment
    // to attach to — the linebreak itself carries no format.
    expect(p.children).toEqual([text('第一行'), { type: 'linebreak', version: 1 }, text('第二行')])
  })

  it('maps decorator marks into the text format bitmask', () => {
    const pt: PortableTextBody = [
      textBlock('b', {}, [
        span('s', ['strong', 'em']),
        span('u', ['underline']),
        span('c', ['strike-through', 'code']),
      ]),
    ]
    const mapped = convertPtBodyToLexical(pt)
    const p = mapped.root.children[0] as LexicalParagraphNode
    expect(p.children).toEqual([text('s', 3), text('u', 8), text('c', 20)])
  })

  it('maps mathInline and footnoteRef marks to their custom nodes with ptKey', () => {
    const pt: PortableTextBody = [
      textBlock(
        'b',
        {
          markDefs: [
            { _type: 'mathInline', _key: 'mi-1', tex: 'x^2', mathml: '<math/>' },
            { _type: 'footnoteRef', _key: 'fr-1', targetKey: 'fn-1', index: 3 },
          ],
        },
        [span('1', ['fr-1']), span('2', ['mi-1']), span('tail')],
      ),
    ]
    const mapped = convertPtBodyToLexical(pt)
    const p = mapped.root.children[0] as LexicalParagraphNode
    expect(p.children).toEqual([
      { type: 'footnoteRef', version: 1, targetKey: 'fn-1', index: 3, ptKey: 'fr-1' },
      { type: 'mathInline', version: 1, tex: 'x^2', mathml: '<math/>', ptKey: 'mi-1' },
      text('tail'),
    ])
  })

  it('maps a link + footnoteRef combination without losing either (link wraps the ref)', () => {
    const pt: PortableTextBody = [
      textBlock(
        'b',
        {
          markDefs: [
            { _type: 'link', _key: 'lk-1', href: 'https://example.com' },
            { _type: 'footnoteRef', _key: 'fr-1', targetKey: 'fn-1', index: 1 },
          ],
        },
        [span('1', ['lk-1', 'fr-1'])],
      ),
    ]
    const mapped = convertPtBodyToLexical(pt)
    const p = mapped.root.children[0] as LexicalParagraphNode
    expect(p.children).toEqual([
      {
        ...elementBase(),
        type: 'link',
        url: 'https://example.com',
        rel: null,
        target: null,
        title: null,
        children: [{ type: 'footnoteRef', version: 1, targetKey: 'fn-1', index: 1, ptKey: 'fr-1' }],
      },
    ])
  })

  it('nests non-canonical list streaks: skipped levels filled, kinds mixed per level', () => {
    // level 1 bullet, level 3 number — the canonicaliser fills level 2
    // with an empty bullet item and the tree nests number under bullet.
    const pt: PortableTextBody = [
      textBlock('b-li1', { listItem: 'bullet', level: 1 }, [span('a')]),
      textBlock('b-li2', { listItem: 'number', level: 3 }, [span('c')]),
    ]
    const mapped = convertPtBodyToLexical(pt)
    const list = mapped.root.children[0] as LexicalListNode
    expect(list.listType).toBe('bullet')
    const li1 = list.children[0]!
    expect(li1.children[0]).toEqual(paragraph([text('a')]))
    const level2 = li1.children[1] as LexicalListNode
    expect(level2.listType).toBe('bullet') // canonicalise fills skipped levels with bullet
    const li2 = level2.children[0]!
    expect((li2.children[0] as LexicalParagraphNode).children).toEqual([]) // empty filler item
    const level3 = li2.children[1] as LexicalListNode
    expect(level3.listType).toBe('number')
    expect((level3.children[0]!.children[0] as LexicalParagraphNode).children).toEqual([text('c')])
  })

  it('splits adjacent same-level streaks with conflicting kinds into two lists', () => {
    const pt: PortableTextBody = [
      textBlock('b-li1', { listItem: 'bullet', level: 1 }, [span('a')]),
      textBlock('b-li2', { listItem: 'number', level: 1 }, [span('b')]),
    ]
    const mapped = convertPtBodyToLexical(pt)
    expect(mapped.root.children).toHaveLength(2)
    expect(mapped.root.children[0]).toMatchObject({ type: 'list', listType: 'bullet' })
    expect(mapped.root.children[1]).toMatchObject({ type: 'list', listType: 'number' })
  })

  it('maps a streak starting at level 2 with a bullet root (canonicalised ancestors)', () => {
    const pt: PortableTextBody = [textBlock('b-li1', { listItem: 'number', level: 2 }, [span('deep')])]
    const mapped = convertPtBodyToLexical(pt)
    const list = mapped.root.children[0] as LexicalListNode
    expect(list.listType).toBe('number') // the streak root keeps the streak kind
    const li1 = list.children[0]!
    expect((li1.children[0] as LexicalParagraphNode).children).toEqual([]) // empty level-1 filler
    const level2 = li1.children[1] as LexicalListNode
    expect(level2.listType).toBe('number')
    expect((level2.children[0]!.children[0] as LexicalParagraphNode).children).toEqual([text('deep')])
  })

  it('preserves footnote targetKey integrity via ptKey on definitions and refs', () => {
    const pt: PortableTextBody = [
      textBlock('b-ref', { markDefs: [{ _type: 'footnoteRef', _key: 'fr-1', targetKey: 'fn-1', index: 1 }] }, [
        span('1', ['fr-1']),
      ]),
      { _type: 'footnoteDefinition', _key: 'fn-1', index: 1, children: [textBlock('b-fn', {}, [span('note')])] },
    ]
    const mapped = convertPtBodyToLexical(pt)
    const ref = (mapped.root.children[0] as LexicalParagraphNode).children.find(
      (c): c is Extract<LexicalInlineNode, { type: 'footnoteRef' }> => c.type === 'footnoteRef',
    )!
    const def = mapped.root.children[1] as LexicalFootnoteDefinitionNode
    expect(ref.targetKey).toBe(def.ptKey)
    expect(ref.index).toBe(def.index)
  })

  it('is deterministic across calls', () => {
    const pt: PortableTextBody = [textBlock('b1', {}, [span('a')]), { _type: 'mathBlock', _key: 'm', tex: 'x' }]
    expect(convertPtBodyToLexical(pt)).toEqual(convertPtBodyToLexical(pt))
  })
})
