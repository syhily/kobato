import type { PortableTextBody } from '@kobato/shared/legacy-pt/schema'
import type {
  LexicalFootnoteDefinitionNode,
  LexicalInlineNode,
  LexicalParagraphNode,
} from '@kobato/shared/lexical/schema'

import { areLexicalBodiesEquivalent, canonicalizeLexicalBodyShape } from '@kobato/editor/lexical-core/canonicalize'
import { convertPtBodyToLexical } from '@kobato/editor/lexical-core/mapping'
import { isEmptyLexicalBody, validateLexicalBody } from '@kobato/editor/lexical-core/validate'
import { describe, expect, it } from 'vitest'

// Canonicalizer + double-gate validator. The canonical shape is the
// 0.45.0 `parseEditorState` → `toJSON` output — assertions below pin the
// field-level effects (paragraph textFormat/textStyle, link title:null,
// cell backgroundColor:null) so the dialect cannot drift.

function elementBase(): { direction: null; format: string; indent: 0; version: 1 } {
  return { direction: null, format: '', indent: 0, version: 1 }
}

function paragraph(children: unknown[] = [], extra: Record<string, unknown> = {}) {
  return { ...elementBase(), type: 'paragraph' as const, children, textFormat: 0, textStyle: '', ...extra }
}

function text(text: string, format = 0) {
  return { detail: 0, format, mode: 'normal' as const, style: '', text, type: 'text' as const, version: 1 }
}

function body(children: unknown[] = []): unknown {
  return { root: { ...elementBase(), type: 'root', children } }
}

describe('editor/lexical-core/validate — validateLexicalBody', () => {
  it('rejects an unknown node type via the zod gate', () => {
    expect(() => validateLexicalBody(body([{ type: 'mystery', version: 1 }]))).toThrow()
  })

  it('rejects a text node with format bits above 127', () => {
    expect(() => validateLexicalBody(body([paragraph([text('x', 128)])]))).toThrow()
  })

  it('rejects a link with an unsafe url', () => {
    const bad = body([
      paragraph([
        {
          ...elementBase(),
          type: 'link',
          url: 'javascript:alert(1)',
          rel: null,
          target: null,
          title: null,
          children: [text('x')],
        },
      ]),
    ])
    expect(() => validateLexicalBody(bad)).toThrow(/url|protocol/i)
  })
})

describe('editor/lexical-core/canonicalize — canonicalizeLexicalBodyShape', () => {
  it('emits the deterministic 0.45.0 serialized form', () => {
    // Pre-canonical input: base fields present, but no `title` on the
    // link, no `backgroundColor` on the cell, no `textFormat`/`textStyle`
    // on the paragraph.
    const input = body([
      {
        ...elementBase(),
        type: 'paragraph',
        version: 1,
        children: [
          { type: 'text', version: 1, text: 'x', detail: 0, format: 0, mode: 'normal', style: '' },
          {
            ...elementBase(),
            type: 'link',
            version: 1,
            url: 'https://example.com',
            rel: null,
            target: null,
            title: null,
            children: [{ type: 'text', version: 1, text: 'y', detail: 0, format: 0, mode: 'normal', style: '' }],
          },
        ],
      },
      {
        ...elementBase(),
        type: 'table',
        version: 1,
        children: [
          {
            ...elementBase(),
            type: 'tablerow',
            version: 1,
            children: [
              {
                ...elementBase(),
                type: 'tablecell',
                version: 1,
                backgroundColor: null,
                colSpan: 1,
                rowSpan: 1,
                headerState: 0,
                children: [{ ...elementBase(), type: 'paragraph', version: 1, children: [] }],
              },
            ],
          },
        ],
      },
    ])
    const canonical = canonicalizeLexicalBodyShape(input)
    const p = canonical.root.children[0] as LexicalParagraphNode
    expect(p.direction).toBeNull()
    expect(p.format).toBe('')
    expect(p.indent).toBe(0)
    expect(p.textFormat).toBe(0)
    expect(p.textStyle).toBe('')
    const link = p.children[1]
    expect(link).toMatchObject({ type: 'link', title: null, rel: null, target: null })
    const cell = (
      canonical.root.children[1] as { children: Array<{ children: Array<{ backgroundColor: string | null }> }> }
    ).children[0]!.children[0]!
    expect(cell.backgroundColor).toBeNull()
  })

  it('strips unknown fields and unknown nodes the gate would drop', () => {
    const input = body([{ type: 'image', version: 1, src: 'https://cdn/x.jpg', meta: { junk: true } }])
    const canonical = canonicalizeLexicalBodyShape(input)
    expect(JSON.stringify(canonical)).not.toContain('junk')
  })

  it('renumbers footnotes in first-citation order and moves definitions to the end', () => {
    const input = body([
      paragraph([text('a'), { type: 'footnoteRef', version: 1, targetKey: 'd2', index: 9, ptKey: 'mk1' }]),
      {
        ...elementBase(),
        type: 'footnoteDefinition',
        ptKey: 'd1',
        index: 7,
        children: [paragraph([text('one')])],
      },
      {
        ...elementBase(),
        type: 'footnoteDefinition',
        ptKey: 'd2',
        index: 8,
        children: [paragraph([text('two')])],
      },
      paragraph([text('b'), { type: 'footnoteRef', version: 1, targetKey: 'd1', index: 9, ptKey: 'mk2' }]),
    ])
    const canonical = canonicalizeLexicalBodyShape(input)
    expect(canonical.root.children.map((c) => c.type)).toEqual([
      'paragraph',
      'paragraph',
      'footnoteDefinition',
      'footnoteDefinition',
    ])
    const defs = canonical.root.children.filter(
      (c): c is LexicalFootnoteDefinitionNode => c.type === 'footnoteDefinition',
    )
    expect(defs.map((d) => [d.ptKey, d.index])).toEqual([
      ['d2', 1],
      ['d1', 2],
    ])
    const refs = canonical.root.children
      .filter((c) => c.type === 'paragraph')
      .flatMap((c) => (c as { children: LexicalInlineNode[] }).children)
      .filter((c) => c.type === 'footnoteRef')
    expect(refs.map((r) => [r.targetKey, r.index])).toEqual([
      ['d2', 1],
      ['d1', 2],
    ])
  })

  it('appends orphan definitions after cited ones', () => {
    const input = body([
      paragraph([text('x'), { type: 'footnoteRef', version: 1, targetKey: 'cited', index: 1 }]),
      { ...elementBase(), type: 'footnoteDefinition', ptKey: 'orphan', index: 9, children: [paragraph([text('o')])] },
      { ...elementBase(), type: 'footnoteDefinition', ptKey: 'cited', index: 1, children: [paragraph([text('c')])] },
    ])
    const canonical = canonicalizeLexicalBodyShape(input)
    const defs = canonical.root.children.filter(
      (c): c is LexicalFootnoteDefinitionNode => c.type === 'footnoteDefinition',
    )
    expect(defs.map((d) => [d.ptKey, d.index])).toEqual([
      ['cited', 1],
      ['orphan', 2],
    ])
  })

  it('is idempotent (canonicalize(canonicalize(x)) equals canonicalize(x))', () => {
    const input = body([
      paragraph([text('Hello '), text('world', 1)]),
      { type: 'image', version: 1, src: 'https://cdn/x.jpg', ptKey: 'i1' },
      {
        ...elementBase(),
        type: 'solution',
        children: [paragraph([text('inner')])],
      },
    ])
    const once = canonicalizeLexicalBodyShape(input)
    const twice = canonicalizeLexicalBodyShape(once)
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once))
  })

  it('is idempotent over mapped PT content (round-trip stability)', () => {
    const pt: PortableTextBody = [
      { _type: 'block', _key: 'b1', style: 'normal', children: [{ _type: 'span', _key: 's1', text: 'a' }] },
      { _type: 'code', _key: 'c1', code: 'const a = 1', language: 'ts' },
    ]
    const mapped = convertPtBodyToLexical(pt)
    const once = canonicalizeLexicalBodyShape(mapped)
    const twice = canonicalizeLexicalBodyShape(once)
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once))
  })

  it('round-trips every custom node type and keeps ptKey through the headless parse', () => {
    const input = body([
      {
        ...elementBase(),
        type: 'solution',
        ptKey: 'sol-1',
        children: [paragraph([text('inner')])],
      },
      {
        ...elementBase(),
        type: 'twoColumn',
        ptKey: 'tc-1',
        children: [
          { ...elementBase(), type: 'twoColumnPane', side: 'left', children: [paragraph([text('L')])] },
          { ...elementBase(), type: 'twoColumnPane', side: 'right', children: [paragraph([text('R')])] },
        ],
      },
      {
        ...elementBase(),
        type: 'footnoteDefinition',
        index: 1,
        ptKey: 'fd-1',
        children: [paragraph([text('note')])],
      },
      paragraph([
        text('x'),
        { type: 'mathInline', version: 1, tex: 'x^2', ptKey: 'mi-1' },
        { type: 'footnoteRef', version: 1, targetKey: 'fd-1', index: 1, ptKey: 'fr-1' },
      ]),
      { type: 'image', version: 1, src: 'https://cdn/x.jpg', ptKey: 'i-1' },
      { type: 'mathBlock', version: 1, tex: 'a^2', ptKey: 'm-1' },
      { type: 'musicPlayer', version: 1, playerId: '7hk2pqrxyzabc012', ptKey: 'mp-1' },
      { type: 'horizontalrule', version: 1 },
    ])
    const canonical = canonicalizeLexicalBodyShape(input)
    const json = JSON.stringify(canonical)
    for (const key of ['sol-1', 'tc-1', 'fd-1', 'mi-1', 'fr-1', 'i-1', 'm-1', 'mp-1']) {
      expect(json).toContain(key)
    }
    // The renumbering engine runs inside canonicalize: the ref targets the
    // only definition, so both settle on index 1 and the definition moves
    // to the end — the 8 top-level nodes survive the round-trip.
    expect(canonical.root.children).toHaveLength(8)
    expect(canonical.root.children[7]).toMatchObject({ type: 'footnoteDefinition', index: 1, ptKey: 'fd-1' })
  })
})

describe('editor/lexical-core/canonicalize — areLexicalBodiesEquivalent', () => {
  it('treats canonically-equal bodies as equivalent despite missing optional fields', () => {
    const withTitle = body([paragraph([text('x')])])
    const withoutTextStyle = body([{ ...elementBase(), type: 'paragraph', children: [text('x')], textFormat: 0 }])
    expect(areLexicalBodiesEquivalent(withTitle, withoutTextStyle)).toBe(true)
  })

  it('detects real content differences', () => {
    const a = body([paragraph([text('same')])])
    const b = body([paragraph([text('different')])])
    expect(areLexicalBodiesEquivalent(a, b)).toBe(false)
  })

  it('treats footnote index drift as equivalent (renumbered by canonicalization)', () => {
    const a = body([
      paragraph([text('x'), { type: 'footnoteRef', version: 1, targetKey: 'd1', index: 1 }]),
      { ...elementBase(), type: 'footnoteDefinition', ptKey: 'd1', index: 1, children: [paragraph([text('n')])] },
    ])
    const b = body([
      paragraph([text('x'), { type: 'footnoteRef', version: 1, targetKey: 'd1', index: 7 }]),
      { ...elementBase(), type: 'footnoteDefinition', ptKey: 'd1', index: 7, children: [paragraph([text('n')])] },
    ])
    expect(areLexicalBodiesEquivalent(a, b)).toBe(true)
  })
})

describe('editor/lexical-core/validate — isEmptyLexicalBody', () => {
  it('treats an empty root and a single empty paragraph as empty', () => {
    expect(isEmptyLexicalBody(canonicalizeLexicalBodyShape(body([])))).toBe(true)
    expect(isEmptyLexicalBody(canonicalizeLexicalBodyShape(body([paragraph([])])))).toBe(true)
  })

  it('treats content-bearing bodies as non-empty', () => {
    expect(isEmptyLexicalBody(canonicalizeLexicalBodyShape(body([paragraph([text('x')])])))).toBe(false)
    expect(
      isEmptyLexicalBody(canonicalizeLexicalBodyShape(body([paragraph([{ type: 'linebreak', version: 1 }])]))),
    ).toBe(false)
  })
})

describe('editor/lexical-core/canonicalize — R5 dialect fixes', () => {
  it('is idempotent: canonicalize(canonicalize(x)) === canonicalize(x) (listitem/quote)', () => {
    const input = body([
      {
        ...elementBase(),
        type: 'quote',
        children: [text('bare inline in quote')],
      },
      {
        ...elementBase(),
        type: 'list',
        listType: 'bullet',
        start: 1,
        tag: 'ul',
        children: [
          // PT-mapping paragraph alias inside a list item.
          { ...elementBase(), type: 'listitem', value: 1, children: [paragraph([text('item')])] },
        ],
      },
    ])
    const once = canonicalizeLexicalBodyShape(input)
    const twice = canonicalizeLexicalBodyShape(once)
    expect(JSON.stringify(once)).toBe(JSON.stringify(twice))
    // The canonical form passes its own gate.
    expect(() => canonicalizeLexicalBodyShape(once)).not.toThrow()
    // Quote children wrap into paragraphs; listitem paragraph aliases
    // flatten into the runtime inline shape.
    const quote = once.root.children.find((n) => n.type === 'quote')
    expect(quote?.type === 'quote' && quote.children[0]?.type).toBe('paragraph')
    const list = once.root.children.find((n) => n.type === 'list')
    expect(list?.type === 'list' && list.children[0]?.type).toBe('listitem')
    if (list?.type === 'list') {
      const item = list.children[0]
      if (item.type === 'listitem') {
        expect(item.children.every((child) => child.type !== 'paragraph')).toBe(true)
      }
    }
  })

  it('rewrites autolink nodes into regular links before the gate', () => {
    const input = body([
      paragraph([
        {
          ...elementBase(),
          type: 'autolink',
          url: 'https://example.com',
          rel: null,
          target: null,
          title: null,
          children: [text('https://example.com')],
        },
      ]),
    ])
    const out = canonicalizeLexicalBodyShape(input)
    const link = out.root.children[0]
    if (link?.type === 'paragraph') {
      expect(link.children[0]).toMatchObject({ type: 'link', url: 'https://example.com' })
    } else {
      throw new Error('expected paragraph')
    }
  })

  it('rejects autolink nodes with unsafe urls after the rewrite', () => {
    const input = body([
      paragraph([
        {
          ...elementBase(),
          type: 'autolink',
          url: 'javascript:alert(1)',
          rel: null,
          target: null,
          title: null,
          children: [text('x')],
        },
      ]),
    ])
    expect(() => canonicalizeLexicalBodyShape(input)).toThrow(/url|protocol/i)
  })
})
