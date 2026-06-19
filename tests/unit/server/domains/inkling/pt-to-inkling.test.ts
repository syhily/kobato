import { describe, expect, it } from 'vitest'

import type { CommentBody } from '@/shared/pt/comment-schema'
import type { PortableTextBody } from '@/shared/pt/schema'

import { validateInklingDocumentForMode } from '@/shared/inkling/features'
import { commentPortableTextToInklingDocument, portableTextToInklingDocument } from '@/shared/inkling/migrate-pt'
import { inklingToPlainText } from '@/shared/inkling/plaintext'

const key = (n: number) => `k${n.toString().padStart(6, '0')}`

function span(text: string, n: number, marks?: string[]) {
  return { _type: 'span' as const, _key: key(n), text, marks }
}

const allDecoratorsBody: PortableTextBody = [
  {
    _type: 'block',
    _key: key(1),
    style: 'normal',
    children: [
      span('bold ', 2, ['strong']),
      span('italic ', 3, ['em']),
      span('underline ', 4, ['underline']),
      span('code ', 5, ['code']),
      span('strike', 6, ['strike-through']),
    ],
  },
]

const linkBody: PortableTextBody = [
  {
    _type: 'block',
    _key: key(1),
    style: 'normal',
    markDefs: [{ _type: 'link', _key: key(2), href: 'https://example.com', target: '_blank', rel: 'noopener' }],
    children: [span('visit ', 3), span('docs', 4, [key(2)])],
  },
]

const inlineMathBody: PortableTextBody = [
  {
    _type: 'block',
    _key: key(1),
    style: 'normal',
    markDefs: [{ _type: 'mathInline', _key: key(2), tex: 'E=mc^2', mathml: '<math>E=mc^2</math>' }],
    children: [span('energy ', 3), span('formula', 4, [key(2)])],
  },
]

const footnoteBody: PortableTextBody = [
  {
    _type: 'block',
    _key: key(1),
    style: 'normal',
    markDefs: [{ _type: 'footnoteRef', _key: key(2), targetKey: key(10), index: 1 }],
    children: [span('text', 3), span('1', 4, [key(2)])],
  },
  {
    _type: 'footnoteDefinition',
    _key: key(10),
    index: 1,
    children: [{ _type: 'block', _key: key(11), style: 'normal', children: [span('Footnote content', 12)] }],
  },
]

const headingsBody: PortableTextBody = [
  { _type: 'block', _key: key(1), style: 'h1', children: [span('Title', 2)] },
  { _type: 'block', _key: key(3), style: 'h2', children: [span('Section', 4)] },
  { _type: 'block', _key: key(5), style: 'h3', children: [span('Sub', 6)] },
  { _type: 'block', _key: key(7), style: 'h4', children: [span('Deep', 8)] },
]

const quoteBody: PortableTextBody = [
  { _type: 'block', _key: key(1), style: 'blockquote', children: [span('Quoted', 2)] },
]

const nestedListBody: PortableTextBody = [
  { _type: 'block', _key: key(1), style: 'normal', listItem: 'bullet', level: 1, children: [span('A', 2)] },
  { _type: 'block', _key: key(3), style: 'normal', listItem: 'number', level: 2, children: [span('A1', 4)] },
  { _type: 'block', _key: key(5), style: 'normal', listItem: 'bullet', level: 1, children: [span('B', 6)] },
]

const imageBody: PortableTextBody = [
  {
    _type: 'image',
    _key: key(1),
    src: 'https://cdn.example/cover.jpg',
    alt: 'Cover',
    caption: 'A caption',
    layout: 'center',
    width: 1280,
    height: 720,
    thumbhash: 'abc',
    storagePath: 'images/2026/cover.jpg',
    imageId: 'img-1',
  },
]

const codeBody: PortableTextBody = [
  { _type: 'code', _key: key(1), code: 'const x = 1', language: 'ts', highlightedHtml: '<pre/>' },
]

const mathBlockBody: PortableTextBody = [
  { _type: 'mathBlock', _key: key(1), tex: 'a^2 + b^2 = c^2', mathml: '<math/>' },
]

const horizontalRuleBody: PortableTextBody = [{ _type: 'horizontalRule', _key: key(1) }]

const musicBody: PortableTextBody = [
  { _type: 'musicPlayer', _key: key(1), playerId: '7hk2pqrxyzabc012', auto: true, center: false },
]

const solutionBody: PortableTextBody = [
  {
    _type: 'solution',
    _key: key(1),
    children: [
      { _type: 'block', _key: key(2), style: 'normal', children: [span('Therefore x = 1', 3)] },
      { _type: 'mathBlock', _key: key(4), tex: 'x=1' },
    ],
  },
]

const twoColumnBody: PortableTextBody = [
  {
    _type: 'twoColumn',
    _key: key(1),
    left: [{ _type: 'image', _key: key(2), src: 'left.jpg' }],
    right: [{ _type: 'block', _key: key(3), style: 'normal', children: [span('Right text', 4)] }],
  },
]

const tableBody: PortableTextBody = [
  {
    _type: 'table',
    _key: key(1),
    hasHeaderRow: true,
    rows: [
      {
        _type: 'tableRow',
        _key: key(2),
        cells: [
          { _type: 'tableCell', _key: key(3), isHeader: true, content: [span('Name', 4)] },
          { _type: 'tableCell', _key: key(5), isHeader: true, content: [span('Value', 6)] },
        ],
      },
      {
        _type: 'tableRow',
        _key: key(7),
        cells: [
          { _type: 'tableCell', _key: key(8), content: [span('x', 9)] },
          { _type: 'tableCell', _key: key(10), content: [span('1', 11)] },
        ],
      },
    ],
  },
]

const fullArticleBody: PortableTextBody = [
  { _type: 'block', _key: key(1), style: 'h2', children: [span('Intro', 2)] },
  { _type: 'block', _key: key(3), style: 'normal', children: [span('Hello world', 4)] },
  { _type: 'block', _key: key(5), style: 'normal', listItem: 'bullet', level: 1, children: [span('Item', 6)] },
  ...imageBody,
  ...codeBody,
  ...mathBlockBody,
  ...horizontalRuleBody,
  ...musicBody,
  ...tableBody,
  ...solutionBody,
  ...twoColumnBody,
  ...footnoteBody,
]

const commentBody: CommentBody = [
  { _type: 'block', _key: key(1), style: 'normal', children: [span('Hello ', 2), span('world', 3, ['strong'])] },
  { _type: 'block', _key: key(4), style: 'blockquote', children: [span('Quoted', 5)] },
  {
    _type: 'block',
    _key: key(6),
    style: 'normal',
    listItem: 'bullet',
    level: 1,
    children: [span('Bullet', 7)],
  },
  {
    _type: 'block',
    _key: key(8),
    style: 'normal',
    markDefs: [{ _type: 'link', _key: key(9), href: 'https://example.com' }],
    children: [span('link', 10, [key(9)])],
  },
  {
    _type: 'block',
    _key: key(11),
    style: 'normal',
    markDefs: [{ _type: 'mathInline', _key: key(12), tex: 'x' }],
    children: [span('x', 13, [key(12)])],
  },
  { _type: 'code', _key: key(14), code: 'const y = 2' },
  { _type: 'mathBlock', _key: key(15), tex: 'y=2' },
]

describe('server/domains/inkling/migrate-pt', () => {
  it('converts empty body to empty Inkling document', () => {
    const doc = portableTextToInklingDocument([])
    expect(validateInklingDocumentForMode(doc, 'article')).toEqual({ ok: true })
    expect(doc.root.children).toHaveLength(1)
    expect(doc.root.children[0]?.type).toBe('paragraph')
    expect(inklingToPlainText(doc)).toBe('')
  })

  it('converts all standard decorators to text format flags', () => {
    const doc = portableTextToInklingDocument(allDecoratorsBody)
    expect(validateInklingDocumentForMode(doc, 'article')).toEqual({ ok: true })
    expect(inklingToPlainText(doc)).toBe('bold italic underline code strike')
  })

  it('converts link markDef to link node', () => {
    const doc = portableTextToInklingDocument(linkBody)
    expect(validateInklingDocumentForMode(doc, 'article')).toEqual({ ok: true })
    expect(inklingToPlainText(doc)).toBe('visit docs')
  })

  it('converts inline math markDef to inline-math node', () => {
    const doc = portableTextToInklingDocument(inlineMathBody)
    expect(validateInklingDocumentForMode(doc, 'article')).toEqual({ ok: true })
    expect(inklingToPlainText(doc)).toBe('energy E=mc^2')
  })

  it('converts footnote ref and definition', () => {
    const doc = portableTextToInklingDocument(footnoteBody)
    expect(validateInklingDocumentForMode(doc, 'article')).toEqual({ ok: true })
    const ref = doc.root.children[0]
    expect(ref?.type).toBe('paragraph')
    expect(inklingToPlainText(doc)).toBe('text1\nFootnote content')
  })

  it('converts headings h1-h4', () => {
    const doc = portableTextToInklingDocument(headingsBody)
    expect(validateInklingDocumentForMode(doc, 'article')).toEqual({ ok: true })
    expect(inklingToPlainText(doc)).toBe('Title\nSection\nSub\nDeep')
  })

  it('converts blockquote', () => {
    const doc = portableTextToInklingDocument(quoteBody)
    expect(validateInklingDocumentForMode(doc, 'article')).toEqual({ ok: true })
    expect(inklingToPlainText(doc)).toBe('Quoted')
  })

  it('converts nested lists preserving hierarchy', () => {
    const doc = portableTextToInklingDocument(nestedListBody)
    expect(validateInklingDocumentForMode(doc, 'article')).toEqual({ ok: true })
    expect(inklingToPlainText(doc)).toBe('- A\n1. A1\n- B')
  })

  it('converts image block to image-card', () => {
    const doc = portableTextToInklingDocument(imageBody)
    expect(validateInklingDocumentForMode(doc, 'article')).toEqual({ ok: true })
    expect(inklingToPlainText(doc)).toBe('Cover')
  })

  it('converts code block to code-block', () => {
    const doc = portableTextToInklingDocument(codeBody)
    expect(validateInklingDocumentForMode(doc, 'article')).toEqual({ ok: true })
    expect(inklingToPlainText(doc)).toBe('const x = 1')
  })

  it('converts math block to math-block', () => {
    const doc = portableTextToInklingDocument(mathBlockBody)
    expect(validateInklingDocumentForMode(doc, 'article')).toEqual({ ok: true })
    expect(inklingToPlainText(doc)).toBe('a^2 + b^2 = c^2')
  })

  it('converts horizontal rule', () => {
    const doc = portableTextToInklingDocument(horizontalRuleBody)
    expect(validateInklingDocumentForMode(doc, 'article')).toEqual({ ok: true })
    expect(inklingToPlainText(doc)).toBe('---')
  })

  it('converts music player to music-card', () => {
    const doc = portableTextToInklingDocument(musicBody)
    expect(validateInklingDocumentForMode(doc, 'article')).toEqual({ ok: true })
    expect(inklingToPlainText(doc)).toBe('[Music: 7hk2pqrxyzabc012]')
  })

  it('converts solution container', () => {
    const doc = portableTextToInklingDocument(solutionBody)
    expect(validateInklingDocumentForMode(doc, 'article')).toEqual({ ok: true })
    expect(inklingToPlainText(doc)).toBe('Therefore x = 1\nx=1')
  })

  it('converts two-column container', () => {
    const doc = portableTextToInklingDocument(twoColumnBody)
    expect(validateInklingDocumentForMode(doc, 'article')).toEqual({ ok: true })
    expect(inklingToPlainText(doc)).toBe('Right text')
  })

  it('converts table preserving header row', () => {
    const doc = portableTextToInklingDocument(tableBody)
    expect(validateInklingDocumentForMode(doc, 'article')).toEqual({ ok: true })
    expect(inklingToPlainText(doc)).toBe('Name\nValue\nx\n1')
  })

  it('converts full article fixture', () => {
    const doc = portableTextToInklingDocument(fullArticleBody)
    expect(validateInklingDocumentForMode(doc, 'article')).toEqual({ ok: true })
    const plain = inklingToPlainText(doc)
    expect(plain).toContain('Intro')
    expect(plain).toContain('Hello world')
    expect(plain).toContain('Item')
    expect(plain).toContain('const x = 1')
    expect(plain).toContain('a^2 + b^2 = c^2')
    expect(plain).toContain('Therefore x = 1')
    expect(plain).toContain('Footnote content')
  })

  it('converts comment body and validates in comment mode', () => {
    const doc = commentPortableTextToInklingDocument(commentBody)
    expect(validateInklingDocumentForMode(doc, 'comment')).toEqual({ ok: true })
    expect(inklingToPlainText(doc)).toBe('Hello world\nQuoted\n- Bullet\nlink\nx\nconst y = 2\ny=2')
  })

  it('rejects article-only blocks in comment converter', () => {
    const badComment = [
      { _type: 'block', _key: key(1), style: 'h1', children: [span('Title', 2)] },
    ] as unknown as CommentBody
    expect(() => commentPortableTextToInklingDocument(badComment)).toThrow()
  })

  it('rejects image block in comment converter', () => {
    const badComment = [{ _type: 'image', _key: key(1), src: 'x.jpg' }] as unknown as CommentBody
    expect(() => commentPortableTextToInklingDocument(badComment)).toThrow()
  })

  it('rejects footnote ref in comment converter', () => {
    const badComment = [
      {
        _type: 'block',
        _key: key(1),
        style: 'normal',
        markDefs: [{ _type: 'footnoteRef', _key: key(2), targetKey: key(3), index: 1 }],
        children: [span('1', 4, [key(2)])],
      },
    ] as unknown as CommentBody
    expect(() => commentPortableTextToInklingDocument(badComment)).toThrow()
  })
})
