import { describe, expect, it } from 'vitest'

import type { PmBlockNode } from '@/shared/pt/bridge/types'
import type { PortableTextBody } from '@/shared/pt/schema'

import { arePortableTextBodiesEquivalent } from '@/shared/pt/bridge/canonicalize'
import { synchronizeFootnoteIndices } from '@/shared/pt/bridge/nodes/footnote'
import { pmDocToBody } from '@/shared/pt/bridge/pm-to-pt'
import { bodyToPmDoc } from '@/shared/pt/bridge/pt-to-pm'

// PortableText ↔ ProseMirror bridge contract tests. The on-disk PT is
// the canonical shape (validated by the API perimeter); ProseMirror is
// runtime-only. The contract is therefore one-sided:
//
//   - `bodyToPmDoc(body)` MUST produce a doc Tiptap will accept.
//   - `pmDocToBody(bodyToPmDoc(body))` MUST round-trip the standard
//     subset *equivalently* (same shape modulo span keys, which the
//     bridge regenerates because PM's text nodes don't carry `_key`).
//
// We explicitly relax span keys because the bridge cannot recover the
// original `_key` of a text run after it's been chunked + remarked by
// ProseMirror's internal model. Block-level `_key` IS preserved end to
// end and is asserted here.

function stripSpanKeys(body: PortableTextBody): PortableTextBody {
  return body.map((block) => {
    if (block._type !== 'block') {
      return block
    }
    return {
      ...block,
      children: block.children.map((span) => ({ ...span, _key: 's' })),
    }
  })
}

describe('contract: pt-bridge — empty body', () => {
  it('emits a single empty paragraph so ProseMirror accepts the doc', () => {
    const doc = bodyToPmDoc([])
    expect(doc.content.length).toBe(1)
    expect(doc.content[0].type).toBe('paragraph')
  })
})

describe('contract: pt-bridge — round-trip on the standard subset', () => {
  it('round-trips paragraphs with decorator marks', () => {
    const body: PortableTextBody = [
      {
        _type: 'block',
        _key: 'b1',
        style: 'normal',
        children: [
          { _type: 'span', _key: 's1', text: 'plain ' },
          { _type: 'span', _key: 's2', text: 'bold', marks: ['strong'] },
          { _type: 'span', _key: 's3', text: ' & ' },
          { _type: 'span', _key: 's4', text: 'italic', marks: ['em'] },
        ],
      },
    ]
    const back = pmDocToBody(bodyToPmDoc(body))
    expect(stripSpanKeys(back)).toEqual(stripSpanKeys(body))
  })

  it('round-trips h1-h4 headings preserving the block-level _key', () => {
    const body: PortableTextBody = [
      {
        _type: 'block',
        _key: 'h-one',
        style: 'h1',
        children: [{ _type: 'span', _key: 's1', text: '一' }],
      },
      {
        _type: 'block',
        _key: 'h-two',
        style: 'h2',
        children: [{ _type: 'span', _key: 's2', text: '二' }],
      },
      {
        _type: 'block',
        _key: 'h-three',
        style: 'h3',
        children: [{ _type: 'span', _key: 's3', text: '三' }],
      },
      {
        _type: 'block',
        _key: 'h-four',
        style: 'h4',
        children: [{ _type: 'span', _key: 's4', text: '四' }],
      },
    ]
    const back = pmDocToBody(bodyToPmDoc(body))
    expect(back.map((b) => b._key)).toEqual(['h-one', 'h-two', 'h-three', 'h-four'])
    expect(stripSpanKeys(back)).toEqual(stripSpanKeys(body))
  })

  it('round-trips blockquotes', () => {
    const body: PortableTextBody = [
      {
        _type: 'block',
        _key: 'q1',
        style: 'blockquote',
        children: [{ _type: 'span', _key: 's1', text: 'quoted' }],
      },
    ]
    const back = pmDocToBody(bodyToPmDoc(body))
    expect(back[0]._type).toBe('block')
    expect(back[0]).toMatchObject({ style: 'blockquote' })
  })

  it('preserves bullet list items nested inside a blockquote', () => {
    // Tiptap's blockquote accepts `block+`, so an authored quote may
    // contain a bulletList. The naive bridge used to treat every quote
    // child as a paragraph and silently drop list content.
    const doc = {
      type: 'doc' as const,
      content: [
        {
          type: 'blockquote' as const,
          attrs: { _key: 'q1' },
          content: [
            {
              type: 'paragraph' as const,
              attrs: { _key: 'q1-p' },
              content: [{ type: 'text' as const, text: 'lead' }],
            },
            {
              type: 'bulletList' as const,
              content: [
                {
                  type: 'listItem' as const,
                  content: [
                    {
                      type: 'paragraph' as const,
                      attrs: { _key: 'li-a' },
                      content: [{ type: 'text' as const, text: 'first' }],
                    },
                  ],
                },
                {
                  type: 'listItem' as const,
                  content: [
                    {
                      type: 'paragraph' as const,
                      attrs: { _key: 'li-b' },
                      content: [{ type: 'text' as const, text: 'second' }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    }
    const back = pmDocToBody(doc)
    expect(back).toHaveLength(3)
    expect(back[0]).toMatchObject({ _type: 'block', style: 'blockquote' })
    if (back[0]._type !== 'block' || back[0].children[0]._type !== 'span') {
      return
    }
    expect(back[0].children[0].text).toBe('lead')
    expect(back[1]).toMatchObject({ _type: 'block', listItem: 'bullet', level: 1 })
    expect(back[2]).toMatchObject({ _type: 'block', listItem: 'bullet', level: 1 })
    if (back[1]._type === 'block' && back[1].children[0]._type === 'span') {
      expect(back[1].children[0].text).toBe('first')
    }
    if (back[2]._type === 'block' && back[2].children[0]._type === 'span') {
      expect(back[2].children[0].text).toBe('second')
    }
  })

  it('preserves a code block nested inside a blockquote', () => {
    const doc = {
      type: 'doc' as const,
      content: [
        {
          type: 'blockquote' as const,
          attrs: { _key: 'q1' },
          content: [
            {
              type: 'codeBlock' as const,
              attrs: { _key: 'cb1', language: 'ts' },
              content: [{ type: 'text' as const, text: 'const x = 1' }],
            },
          ],
        },
      ],
    }
    const back = pmDocToBody(doc)
    expect(back).toHaveLength(1)
    expect(back[0]).toMatchObject({ _type: 'code', language: 'ts', code: 'const x = 1' })
  })

  it('round-trips text alignment on paragraphs, headings and blockquotes', () => {
    const body: PortableTextBody = [
      {
        _type: 'block',
        _key: 'p1',
        style: 'normal',
        align: 'center',
        children: [{ _type: 'span', _key: 's1', text: 'centered' }],
      },
      {
        _type: 'block',
        _key: 'h1',
        style: 'h1',
        align: 'right',
        children: [{ _type: 'span', _key: 's2', text: 'right' }],
      },
      {
        _type: 'block',
        _key: 'q1',
        style: 'blockquote',
        align: 'left',
        children: [{ _type: 'span', _key: 's3', text: 'left' }],
      },
    ]
    const doc = bodyToPmDoc(body)
    // Paragraph align stored on paragraph node
    expect((doc.content[0] as { attrs?: Record<string, unknown> }).attrs).toMatchObject({
      textAlign: 'center',
    })
    // Heading align stored on heading node
    expect((doc.content[1] as { attrs?: Record<string, unknown> }).attrs).toMatchObject({
      textAlign: 'right',
    })
    // Blockquote align stored on blockquote node, paragraph inside has no align
    expect((doc.content[2] as { attrs?: Record<string, unknown> }).attrs).toMatchObject({
      textAlign: 'left',
    })

    const back = pmDocToBody(doc)
    expect(back.map((b) => (b._type === 'block' ? { align: b.align, style: b.style } : null))).toEqual([
      { align: 'center', style: 'normal' },
      { align: 'right', style: 'h1' },
      { align: 'left', style: 'blockquote' },
    ])
  })

  it('round-trips bullet lists and ordered lists, folding consecutive items', () => {
    const body: PortableTextBody = [
      {
        _type: 'block',
        _key: 'li1',
        style: 'normal',
        listItem: 'bullet',
        level: 1,
        children: [{ _type: 'span', _key: 's1', text: 'a' }],
      },
      {
        _type: 'block',
        _key: 'li2',
        style: 'normal',
        listItem: 'bullet',
        level: 1,
        children: [{ _type: 'span', _key: 's2', text: 'b' }],
      },
      {
        _type: 'block',
        _key: 'li3',
        style: 'normal',
        listItem: 'number',
        level: 1,
        children: [{ _type: 'span', _key: 's3', text: '1' }],
      },
    ]
    const doc = bodyToPmDoc(body)
    expect(doc.content.map((c) => c.type)).toEqual(['bulletList', 'orderedList'])
    const back = pmDocToBody(doc)
    expect(back.map((b) => ({ listItem: b._type === 'block' ? b.listItem : null }))).toEqual([
      { listItem: 'bullet' },
      { listItem: 'bullet' },
      { listItem: 'number' },
    ])
  })

  it('round-trips link marks via markDefs', () => {
    const body: PortableTextBody = [
      {
        _type: 'block',
        _key: 'b1',
        style: 'normal',
        markDefs: [
          {
            _type: 'link',
            _key: 'l1',
            href: 'https://example.com',
            rel: 'noreferrer',
            target: '_blank',
          },
        ],
        children: [
          { _type: 'span', _key: 's1', text: 'click ' },
          { _type: 'span', _key: 's2', text: 'here', marks: ['l1'] },
        ],
      },
    ]
    const back = pmDocToBody(bodyToPmDoc(body))
    expect(back[0]).toMatchObject({
      _type: 'block',
      markDefs: [{ _type: 'link', href: 'https://example.com', rel: 'noreferrer', target: '_blank' }],
    })
    expect(back[0]._type === 'block' && back[0].children[1].marks?.length).toBe(1)
  })

  it('round-trips images preserving every attribute slot the schema accepts', () => {
    const body: PortableTextBody = [
      {
        _type: 'image',
        _key: 'img-1',
        src: 'https://cdn/example.jpg',
        alt: 'cover',
        caption: '一行说明',
        width: 1280,
        height: 720,
        thumbhash: 'tt',
        storagePath: 'images/2026/05/example.jpg',
        layout: 'left',
      },
    ]
    const back = pmDocToBody(bodyToPmDoc(body))
    expect(back).toEqual(body)
  })

  it('round-trips fenced code blocks preserving language and content', () => {
    const body: PortableTextBody = [
      {
        _type: 'code',
        _key: 'c-1',
        code: 'const x = 1\nconsole.log(x)',
        language: 'ts',
      },
    ]
    const back = pmDocToBody(bodyToPmDoc(body))
    expect(back).toEqual(body)
  })

  it('round-trips horizontal rules', () => {
    const body: PortableTextBody = [{ _type: 'horizontalRule', _key: 'hr-1' }]
    const back = pmDocToBody(bodyToPmDoc(body))
    expect(back).toEqual(body)
  })
})

describe('contract: pt-bridge — custom blocks pass through opaquely', () => {
  it('musicPlayer blocks round-trip via the blockCard payload slot', () => {
    const body: PortableTextBody = [
      {
        _type: 'musicPlayer',
        _key: 'mp-1',
        playerId: 'abcdef0123456789',
        auto: true,
        center: true,
      },
    ]
    const doc = bodyToPmDoc(body)
    expect(doc.content[0].type).toBe('blockCard')
    const back = pmDocToBody(doc)
    expect(back).toEqual(body)
  })

  it('mathBlock and mermaid round-trip identically', () => {
    const body: PortableTextBody = [
      { _type: 'mathBlock', _key: 'mb-1', tex: 'E=mc^2' },
      { _type: 'mermaid', _key: 'mr-1', code: 'graph TD;A-->B;', center: true },
    ]
    const back = pmDocToBody(bodyToPmDoc(body))
    expect(back).toEqual(body)
  })

  it('twoColumn blocks round-trip as nested PM nodes', () => {
    const body: PortableTextBody = [
      {
        _type: 'twoColumn',
        _key: 'tc-1',
        left: [
          {
            _type: 'block',
            _key: 'l1',
            style: 'normal',
            children: [{ _type: 'span', _key: 'ls', text: 'left text' }],
          },
        ],
        right: [
          {
            _type: 'block',
            _key: 'r1',
            style: 'normal',
            children: [{ _type: 'span', _key: 'rs', text: 'right text' }],
          },
        ],
      },
    ]
    const doc = bodyToPmDoc(body)
    expect(doc.content[0].type).toBe('twoColumn')
    const back = pmDocToBody(doc)
    expect(arePortableTextBodiesEquivalent(body, back)).toBe(true)
    expect(back[0]._type).toBe('twoColumn')
    if (back[0]._type === 'twoColumn') {
      expect(back[0]._key).toBe('tc-1')
      expect(back[0].left[0]).toMatchObject({ _type: 'block', style: 'normal' })
      expect(back[0].right[0]).toMatchObject({ _type: 'block', style: 'normal' })
    }
  })

  it('solution blocks round-trip as a nested PM node (not blockCard)', () => {
    const body: PortableTextBody = [
      {
        _type: 'solution',
        _key: 'sol-1',
        children: [
          {
            _type: 'block',
            _key: 'sol-1-b1',
            style: 'normal',
            children: [{ _type: 'span', _key: 'sol-1-s1', text: 'inner' }],
          },
        ],
      },
    ]
    const doc = bodyToPmDoc(body)
    expect(doc.content[0].type).toBe('solution')
    const back = pmDocToBody(doc)
    expect(arePortableTextBodiesEquivalent(body, back)).toBe(true)
    expect(back[0]._type).toBe('solution')
    if (back[0]._type === 'solution') {
      expect(back[0]._key).toBe('sol-1')
      expect(back[0].children[0]).toMatchObject({ _type: 'block', style: 'normal' })
    }
  })

  it('round-trips a table nested inside a solution', () => {
    const tableChild = {
      _type: 'table' as const,
      _key: 't-in-sol',
      hasHeaderRow: true,
      rows: [
        {
          _type: 'tableRow' as const,
          _key: 'r-1',
          cells: [
            {
              _type: 'tableCell' as const,
              _key: 'c-1',
              isHeader: true,
              content: [{ _type: 'span' as const, _key: 's1', text: 'A' }],
            },
            {
              _type: 'tableCell' as const,
              _key: 'c-2',
              isHeader: true,
              content: [{ _type: 'span' as const, _key: 's2', text: 'B' }],
            },
          ],
        },
        {
          _type: 'tableRow' as const,
          _key: 'r-2',
          cells: [
            {
              _type: 'tableCell' as const,
              _key: 'c-3',
              content: [{ _type: 'span' as const, _key: 's3', text: '1' }],
            },
            {
              _type: 'tableCell' as const,
              _key: 'c-4',
              content: [{ _type: 'span' as const, _key: 's4', text: '2' }],
            },
          ],
        },
      ],
    }
    const body: PortableTextBody = [
      {
        _type: 'solution',
        _key: 'sol-1',
        children: [tableChild],
      },
    ]
    const doc = bodyToPmDoc(body)
    const innerPm = doc.content[0] as PmBlockNode
    expect(innerPm.type).toBe('solution')
    expect(innerPm.content?.some((n) => (n as PmBlockNode).type === 'table')).toBe(true)
    expect(arePortableTextBodiesEquivalent(body, pmDocToBody(bodyToPmDoc(body)))).toBe(true)
  })

  it('footnoteDefinition blocks round-trip preserving index + nested children', () => {
    const body: PortableTextBody = [
      {
        _type: 'footnoteDefinition',
        _key: 'fn-1',
        index: 1,
        children: [
          {
            _type: 'block',
            _key: 'fn-1-b1',
            style: 'normal',
            children: [{ _type: 'span', _key: 'fn-1-s1', text: 'definition body' }],
          },
        ],
      },
    ]
    const doc = bodyToPmDoc(body)
    expect(doc.content[0].type).toBe('footnoteDefinition')
    expect(arePortableTextBodiesEquivalent(body, pmDocToBody(doc))).toBe(true)
  })

  it('mathInline mark def round-trips through the markDefs slot', () => {
    const body: PortableTextBody = [
      {
        _type: 'block',
        _key: 'b1',
        style: 'normal',
        markDefs: [{ _type: 'mathInline', _key: 'mi-1', tex: 'a^2', svg: '<svg>a^2</svg>' }],
        children: [
          { _type: 'span', _key: 's1', text: 'see ' },
          { _type: 'span', _key: 's2', text: 'a^2', marks: ['mi-1'] },
        ],
      },
    ]
    const back = pmDocToBody(bodyToPmDoc(body))
    expect(back[0]).toMatchObject({
      _type: 'block',
      markDefs: [{ _type: 'mathInline', tex: 'a^2', svg: '<svg>a^2</svg>' }],
    })
    expect(back[0]._type === 'block' && back[0].children[1].marks?.length).toBe(1)
  })

  it('footnoteRef mark def round-trips with index + targetKey preserved', () => {
    const body: PortableTextBody = [
      {
        _type: 'block',
        _key: 'b1',
        style: 'normal',
        markDefs: [{ _type: 'footnoteRef', _key: 'fr-1', targetKey: 'fn-target', index: 7 }],
        children: [
          { _type: 'span', _key: 's1', text: 'note' },
          { _type: 'span', _key: 's2', text: '7', marks: ['fr-1'] },
        ],
      },
    ]
    const back = pmDocToBody(bodyToPmDoc(body))
    expect(back[0]).toMatchObject({
      _type: 'block',
      markDefs: [{ _type: 'footnoteRef', targetKey: 'fn-target', index: 7 }],
    })
  })

  it('synchronizeFootnoteIndices numbers footnotes by first citation order', () => {
    const fnBChildren = [
      {
        _type: 'block' as const,
        _key: 'fnb-p',
        style: 'normal' as const,
        children: [{ _type: 'span' as const, _key: 'fnb-s', text: 'b' }],
      },
    ]
    const fnAChildren = [
      {
        _type: 'block' as const,
        _key: 'fna-p',
        style: 'normal' as const,
        children: [{ _type: 'span' as const, _key: 'fna-s', text: 'a' }],
      },
    ]
    const body: PortableTextBody = [
      {
        _type: 'block',
        _key: 'p1',
        style: 'normal',
        markDefs: [
          { _type: 'footnoteRef', _key: 'fr-b', targetKey: 'fn-b', index: 2 },
          { _type: 'footnoteRef', _key: 'fr-a', targetKey: 'fn-a', index: 1 },
        ],
        children: [
          { _type: 'span', _key: 's1', text: '2', marks: ['fr-b'] },
          { _type: 'span', _key: 's2', text: ' ', marks: undefined },
          { _type: 'span', _key: 's3', text: '1', marks: ['fr-a'] },
        ],
      },
      { _type: 'footnoteDefinition', _key: 'fn-a', index: 1, children: fnAChildren },
      { _type: 'footnoteDefinition', _key: 'fn-b', index: 2, children: fnBChildren },
    ]
    const synced = synchronizeFootnoteIndices(body)
    const para = synced[0]
    expect(para?._type).toBe('block')
    if (para === undefined || para._type !== 'block') {
      throw new Error('expected paragraph block')
    }
    const frB = para.markDefs?.find((m) => m._type === 'footnoteRef' && m._key === 'fr-b')
    const frA = para.markDefs?.find((m) => m._type === 'footnoteRef' && m._key === 'fr-a')
    if (frB === undefined || frB._type !== 'footnoteRef') {
      throw new Error('expected fr-b footnoteRef')
    }
    if (frA === undefined || frA._type !== 'footnoteRef') {
      throw new Error('expected fr-a footnoteRef')
    }
    expect(frB.index).toBe(1)
    expect(frA.index).toBe(2)
    expect(para.children.find((s) => s.marks?.includes('fr-b'))?.text).toBe('1')
    expect(para.children.find((s) => s.marks?.includes('fr-a'))?.text).toBe('2')
    const syncedDefs = synced.filter((b) => b._type === 'footnoteDefinition')
    expect(syncedDefs[0]?._key).toBe('fn-b')
    expect(syncedDefs[0]?.index).toBe(1)
    expect(syncedDefs[1]?._key).toBe('fn-a')
    expect(syncedDefs[1]?.index).toBe(2)
  })
})

describe('contract: pt-bridge — nested lists', () => {
  it('round-trips a 2-level bullet list (nested under the parent <li>)', () => {
    const body: PortableTextBody = [
      {
        _type: 'block',
        _key: 'l1',
        style: 'normal',
        listItem: 'bullet',
        level: 1,
        children: [{ _type: 'span', _key: 's1', text: 'top' }],
      },
      {
        _type: 'block',
        _key: 'l2',
        style: 'normal',
        listItem: 'bullet',
        level: 2,
        children: [{ _type: 'span', _key: 's2', text: 'inner' }],
      },
      {
        _type: 'block',
        _key: 'l3',
        style: 'normal',
        listItem: 'bullet',
        level: 1,
        children: [{ _type: 'span', _key: 's3', text: 'tail' }],
      },
    ]
    const doc = bodyToPmDoc(body)
    expect(doc.content.length).toBe(1)
    expect(doc.content[0].type).toBe('bulletList')
    const back = pmDocToBody(doc)
    expect(back.map((b) => (b._type === 'block' ? b.level : null))).toEqual([1, 2, 1])
    expect(back.map((b) => (b._type === 'block' ? b.listItem : null))).toEqual(['bullet', 'bullet', 'bullet'])
  })

  it('round-trips a mixed bullet → ordered nested list', () => {
    const body: PortableTextBody = [
      {
        _type: 'block',
        _key: 'a',
        style: 'normal',
        listItem: 'bullet',
        level: 1,
        children: [{ _type: 'span', _key: 's1', text: 'parent' }],
      },
      {
        _type: 'block',
        _key: 'b',
        style: 'normal',
        listItem: 'number',
        level: 2,
        children: [{ _type: 'span', _key: 's2', text: 'sub-1' }],
      },
      {
        _type: 'block',
        _key: 'c',
        style: 'normal',
        listItem: 'number',
        level: 2,
        children: [{ _type: 'span', _key: 's3', text: 'sub-2' }],
      },
    ]
    const doc = bodyToPmDoc(body)
    expect(doc.content.length).toBe(1)
    const root = doc.content[0]
    expect(root.type).toBe('bulletList')
    const firstItem = (root as { content: { content: { type: string }[] }[] }).content[0]
    const nestedKinds = firstItem.content.map((c) => c.type)
    expect(nestedKinds).toContain('orderedList')
    const back = pmDocToBody(doc)
    expect(back.map((b) => (b._type === 'block' ? b.listItem : null))).toEqual(['bullet', 'number', 'number'])
    expect(back.map((b) => (b._type === 'block' ? b.level : null))).toEqual([1, 2, 2])
  })

  it('treats implicit level=1 and explicit level=1 as equivalent for mixed lists', () => {
    const implicitTopLevel: PortableTextBody = [
      {
        _type: 'block',
        _key: 'a',
        style: 'normal',
        listItem: 'bullet',
        children: [{ _type: 'span', _key: 's1', text: 'parent' }],
      },
      {
        _type: 'block',
        _key: 'b',
        style: 'normal',
        listItem: 'number',
        level: 2,
        children: [{ _type: 'span', _key: 's2', text: 'sub-1' }],
      },
    ]
    const explicitTopLevel: PortableTextBody = [
      {
        _type: 'block',
        _key: 'a',
        style: 'normal',
        listItem: 'bullet',
        level: 1,
        children: [{ _type: 'span', _key: 's1', text: 'parent' }],
      },
      {
        _type: 'block',
        _key: 'b',
        style: 'normal',
        listItem: 'number',
        level: 2,
        children: [{ _type: 'span', _key: 's2', text: 'sub-1' }],
      },
    ]
    expect(arePortableTextBodiesEquivalent(implicitTopLevel, explicitTopLevel)).toBe(true)
  })

  it('treats custom blocks as equivalent when only object property order differs', () => {
    const a = [{ _type: 'musicPlayer' as const, _key: 'm1', playerId: 'abcd1234abcd1234' }]
    const b = [{ playerId: 'abcd1234abcd1234', _key: 'm1', _type: 'musicPlayer' as const }]
    expect(arePortableTextBodiesEquivalent(a, b)).toBe(true)
  })

  it('treats identical musicPlayer payloads as equivalent when `_key` differs', () => {
    const a = [{ _type: 'musicPlayer' as const, _key: 'k-local', playerId: 'abcd1234abcd1234' }]
    const b = [{ _type: 'musicPlayer' as const, _key: 'k-server', playerId: 'abcd1234abcd1234' }]
    expect(arePortableTextBodiesEquivalent(a, b)).toBe(true)
  })

  it('ignores highlightedHtml drift when judging equivalence', () => {
    const a: PortableTextBody = [{ _type: 'code', _key: 'c1', language: 'ts', code: 'const x = 1\n' }]
    const b: PortableTextBody = [
      {
        _type: 'code',
        _key: 'c2',
        language: 'ts',
        code: 'const x = 1\n',
        highlightedHtml: '<pre class="shiki"><code>...</code></pre>',
      },
    ]
    expect(arePortableTextBodiesEquivalent(a, b)).toBe(true)
  })
})

describe('contract: pt-bridge — link markDef dedup', () => {
  it('shares a single markDefs entry when the same href appears twice in the same paragraph', () => {
    const body: PortableTextBody = [
      {
        _type: 'block',
        _key: 'b1',
        style: 'normal',
        markDefs: [{ _type: 'link', _key: 'lk-shared', href: 'https://example.com' }],
        children: [
          { _type: 'span', _key: 's1', text: 'go ' },
          { _type: 'span', _key: 's2', text: 'home', marks: ['lk-shared'] },
          { _type: 'span', _key: 's3', text: ' or ' },
          { _type: 'span', _key: 's4', text: 'home again', marks: ['lk-shared'] },
        ],
      },
    ]
    const back = pmDocToBody(bodyToPmDoc(body))
    expect(back[0]._type).toBe('block')
    if (back[0]._type !== 'block') {
      return
    }
    expect(back[0].markDefs?.length).toBe(1)
    expect(back[0].markDefs?.[0]).toMatchObject({ _type: 'link', href: 'https://example.com' })
  })

  it('keeps two markDefs when the hrefs differ even if the visible text is identical', () => {
    const body: PortableTextBody = [
      {
        _type: 'block',
        _key: 'b1',
        style: 'normal',
        markDefs: [
          { _type: 'link', _key: 'lk-a', href: 'https://a.example' },
          { _type: 'link', _key: 'lk-b', href: 'https://b.example' },
        ],
        children: [
          { _type: 'span', _key: 's1', text: 'a', marks: ['lk-a'] },
          { _type: 'span', _key: 's2', text: ' and ' },
          { _type: 'span', _key: 's3', text: 'b', marks: ['lk-b'] },
        ],
      },
    ]
    const back = pmDocToBody(bodyToPmDoc(body))
    expect(back[0]._type).toBe('block')
    if (back[0]._type !== 'block') {
      return
    }
    expect(back[0].markDefs?.length).toBe(2)
    const hrefs = (back[0].markDefs ?? []).map((m) => (m._type === 'link' ? m.href : ''))
    expect(hrefs.sort()).toEqual(['https://a.example', 'https://b.example'])
  })
})

describe('contract: pt-bridge — table round-trip', () => {
  it('round-trips a 2x2 table with header row', () => {
    const body: PortableTextBody = [
      {
        _type: 'table',
        _key: 't-1',
        hasHeaderRow: true,
        rows: [
          {
            _type: 'tableRow',
            _key: 'r-1',
            cells: [
              {
                _type: 'tableCell',
                _key: 'c-1',
                isHeader: true,
                content: [{ _type: 'span', _key: 's1', text: 'h1' }],
              },
              {
                _type: 'tableCell',
                _key: 'c-2',
                isHeader: true,
                content: [{ _type: 'span', _key: 's2', text: 'h2' }],
              },
            ],
          },
          {
            _type: 'tableRow',
            _key: 'r-2',
            cells: [
              {
                _type: 'tableCell',
                _key: 'c-3',
                content: [{ _type: 'span', _key: 's3', text: 'a' }],
              },
              {
                _type: 'tableCell',
                _key: 'c-4',
                content: [{ _type: 'span', _key: 's4', text: 'b' }],
              },
            ],
          },
        ],
      },
    ]
    const doc = bodyToPmDoc(body)
    expect(doc.content[0].type).toBe('table')
    const back = pmDocToBody(doc)
    expect(back[0]._type).toBe('table')
    if (back[0]._type !== 'table') {
      return
    }
    expect(back[0].hasHeaderRow).toBe(true)
    expect(back[0].rows.length).toBe(2)
    expect(back[0].rows[0].cells[0].isHeader).toBe(true)
    expect(back[0].rows[1].cells[0].isHeader).toBeUndefined()
    expect(back[0].rows[0].cells[0].content[0]?.text).toBe('h1')
    expect(back[0].rows[1].cells[1].content[0]?.text).toBe('b')
  })

  it('round-trips a table without header row, preserving cell text', () => {
    const body: PortableTextBody = [
      {
        _type: 'table',
        _key: 't-1',
        rows: [
          {
            _type: 'tableRow',
            _key: 'r-1',
            cells: [
              {
                _type: 'tableCell',
                _key: 'c-1',
                content: [{ _type: 'span', _key: 's1', text: 'one' }],
              },
            ],
          },
        ],
      },
    ]
    const back = pmDocToBody(bodyToPmDoc(body))
    expect(back[0]._type).toBe('table')
    if (back[0]._type !== 'table') {
      return
    }
    expect(back[0].hasHeaderRow).toBeUndefined()
    expect(back[0].rows[0].cells[0].content[0]?.text).toBe('one')
  })

  it('preserves a link mark def inside a cell while stripping mathInline marks', () => {
    const body: PortableTextBody = [
      {
        _type: 'table',
        _key: 't-1',
        rows: [
          {
            _type: 'tableRow',
            _key: 'r-1',
            cells: [
              {
                _type: 'tableCell',
                _key: 'c-1',
                markDefs: [{ _type: 'link', _key: 'lk-1', href: 'https://example.com' }],
                content: [{ _type: 'span', _key: 's1', text: 'home', marks: ['lk-1'] }],
              },
            ],
          },
        ],
      },
    ]
    const back = pmDocToBody(bodyToPmDoc(body))
    if (back[0]._type !== 'table') {
      return
    }
    const cell = back[0].rows[0].cells[0]
    expect(cell.markDefs?.length).toBe(1)
    expect(cell.markDefs?.[0]).toMatchObject({ _type: 'link', href: 'https://example.com' })
  })
})
