/* oxlint-disable typescript/no-unsafe-type-assertion */
import { describe, expect, it } from 'vitest'

import type { Block, NonRecursiveBlock, PortableTextBody, TextBlock } from '@/shared/pt/schema'

import {
  bodyToPlainText,
  collectHeadings,
  collectHeadingSlotsInPortableTextRenderOrder,
  collectImageStoragePaths,
  generateBlockKey,
  safeValidatePortableTextBody,
  validatePortableTextBody,
} from '@/shared/pt/utils'

// --- fixtures -------------------------------------------------------------

let n = 0
function key(p: string): string {
  n += 1
  return `${p}${n}`
}

function textBlock(text: string, style: TextBlock['style'] = 'normal'): NonRecursiveBlock {
  return {
    _type: 'block',
    _key: key('b'),
    style,
    children: [{ _type: 'span', _key: key('s'), text }],
  } as NonRecursiveBlock
}

function imageBlock(storagePath?: string, alt?: string): NonRecursiveBlock {
  return {
    _type: 'image',
    _key: key('i'),
    src: 'https://example.com/x.png',
    alt,
    storagePath,
  } as NonRecursiveBlock
}

// --- generateBlockKey -----------------------------------------------------

describe('shared/pt/utils — generateBlockKey', () => {
  it('returns a 12-char [a-z0-9] string', () => {
    const k = generateBlockKey()
    expect(k).toMatch(/^[a-z0-9]{12}$/)
  })

  it('returns distinct values across calls', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 50; i += 1) {
      seen.add(generateBlockKey())
    }
    expect(seen.size).toBe(50)
  })
})

// --- collectHeadingSlotsInPortableTextRenderOrder -------------------------

describe('shared/pt/utils — collectHeadingSlotsInPortableTextRenderOrder', () => {
  it('skips footnoteDefinition at the top level during the main pass', () => {
    const body: PortableTextBody = [
      textBlock('h', 'h2'),
      {
        _type: 'footnoteDefinition',
        _key: 'fn1',
        index: 1,
        children: [textBlock('in fn', 'h3')],
      },
    ]
    const slots = collectHeadingSlotsInPortableTextRenderOrder(body)
    // Main column first (h2), then footnote definitions visited at the end (h3).
    expect(slots.map((s) => s.depth)).toEqual([2, 3])
    expect(slots.map((s) => s.plainText)).toEqual(['h', 'in fn'])
  })

  it('descends into solution children', () => {
    const body: PortableTextBody = [{ _type: 'solution', _key: 'sol', children: [textBlock('sol h', 'h4')] }]
    const slots = collectHeadingSlotsInPortableTextRenderOrder(body)
    expect(slots.map((s) => s.depth)).toEqual([4])
  })

  it('descends into twoColumn left then right', () => {
    const body: PortableTextBody = [
      {
        _type: 'twoColumn',
        _key: 'tc',
        left: [textBlock('L', 'h2')],
        right: [textBlock('R', 'h3')],
      },
    ]
    const slots = collectHeadingSlotsInPortableTextRenderOrder(body)
    expect(slots.map((s) => s.plainText)).toEqual(['L', 'R'])
  })

  it('skips normal and blockquote styles', () => {
    const body: PortableTextBody = [
      textBlock('para', 'normal'),
      textBlock('quote', 'blockquote'),
      textBlock('keep', 'h2'),
    ]
    const slots = collectHeadingSlotsInPortableTextRenderOrder(body)
    expect(slots).toHaveLength(1)
    expect(slots[0]!.plainText).toBe('keep')
  })

  it('skips empty headings after trimming', () => {
    const body: PortableTextBody = [
      { _type: 'block', _key: 'b1', style: 'h2', children: [{ _type: 'span', _key: 's1', text: '   ' }] },
    ]
    expect(collectHeadingSlotsInPortableTextRenderOrder(body)).toEqual([])
  })

  it('skips blocks whose style is undefined', () => {
    const body: PortableTextBody = [
      { _type: 'block', _key: 'b1', children: [{ _type: 'span', _key: 's1', text: 'no style' }] } as unknown as Block,
    ]
    expect(collectHeadingSlotsInPortableTextRenderOrder(body)).toEqual([])
  })
})

// --- collectHeadings ------------------------------------------------------

describe('shared/pt/utils — collectHeadings', () => {
  it('builds slugs from heading text using Slugger', () => {
    const body: PortableTextBody = [textBlock('Hello World', 'h2')]
    const headings = collectHeadings(body)
    expect(headings).toEqual([{ depth: 2, text: 'Hello World', slug: 'hello-world' }])
  })

  it('applies the optional transform before slugging', () => {
    const body: PortableTextBody = [textBlock('Hello', 'h1')]
    const headings = collectHeadings(body, () => 'transformed')
    expect(headings[0]!.slug).toBe('transformed')
  })

  it('dedups identical heading slugs with -1, -2 suffixes', () => {
    const body: PortableTextBody = [textBlock('Same', 'h2'), textBlock('Same', 'h2')]
    const headings = collectHeadings(body)
    expect(headings.map((h) => h.slug)).toEqual(['same', 'same-1'])
  })
})

// --- collectImageStoragePaths --------------------------------------------

describe('shared/pt/utils — collectImageStoragePaths', () => {
  it('collects storagePath from top-level image blocks, deduped', () => {
    const body: PortableTextBody = [
      imageBlock('images/a.png'),
      imageBlock('images/a.png'),
      imageBlock('images/b.png'),
      imageBlock(undefined),
      imageBlock(''),
    ]
    expect(collectImageStoragePaths(body)).toEqual(['images/a.png', 'images/b.png'])
  })

  it('descends into solution and footnoteDefinition children', () => {
    const body: PortableTextBody = [
      {
        _type: 'solution',
        _key: 'sol',
        children: [imageBlock('images/sol.png')],
      },
      {
        _type: 'footnoteDefinition',
        _key: 'fn',
        index: 1,
        children: [imageBlock('images/fn.png')],
      },
    ]
    expect(collectImageStoragePaths(body)).toEqual(['images/sol.png', 'images/fn.png'])
  })

  it('descends into twoColumn left and right', () => {
    const body: PortableTextBody = [
      {
        _type: 'twoColumn',
        _key: 'tc',
        left: [imageBlock('images/l.png')],
        right: [imageBlock('images/r.png')],
      },
    ]
    expect(collectImageStoragePaths(body)).toEqual(['images/l.png', 'images/r.png'])
  })
})

// --- bodyToPlainText ------------------------------------------------------

describe('shared/pt/utils — bodyToPlainText', () => {
  it('joins spans inside a text block', () => {
    const body: PortableTextBody = [
      {
        _type: 'block',
        _key: 'b1',
        style: 'normal',
        children: [
          { _type: 'span', _key: 's1', text: 'Hello ' },
          { _type: 'span', _key: 's2', text: 'World' },
        ],
      },
    ]
    expect(bodyToPlainText(body)).toBe('Hello World')
  })

  it('emits code block content as-is', () => {
    const body: PortableTextBody = [{ _type: 'code', _key: 'c1', code: 'const x = 1' }]
    expect(bodyToPlainText(body)).toBe('const x = 1')
  })

  it('emits mathBlock tex', () => {
    const body: PortableTextBody = [{ _type: 'mathBlock', _key: 'm1', tex: 'a^2 + b^2' }]
    expect(bodyToPlainText(body)).toBe('a^2 + b^2')
  })

  it('falls back to alt text for image blocks (skips when empty)', () => {
    const body: PortableTextBody = [
      { _type: 'image', _key: 'i1', src: 'x', alt: 'a cat' },
      { _type: 'image', _key: 'i2', src: 'y' },
      { _type: 'image', _key: 'i3', src: 'z', alt: '' },
    ]
    expect(bodyToPlainText(body)).toBe('a cat')
  })

  it('renders table cells separated by newlines', () => {
    const body: PortableTextBody = [
      {
        _type: 'table',
        _key: 't1',
        rows: [
          {
            _type: 'tableRow',
            _key: 'r1',
            cells: [
              {
                _type: 'tableCell',
                _key: 'c1',
                content: [{ _type: 'span', _key: 's1', text: 'A' }],
              },
              {
                _type: 'tableCell',
                _key: 'c2',
                content: [{ _type: 'span', _key: 's2', text: 'B' }],
              },
            ],
          },
        ],
      },
    ]
    expect(bodyToPlainText(body)).toBe('A\nB')
  })

  it('renders horizontalRule as ---', () => {
    const body: PortableTextBody = [{ _type: 'horizontalRule', _key: 'h1' }]
    expect(bodyToPlainText(body)).toBe('---')
  })

  it('renders musicPlayer as [Music: playerId]', () => {
    const body: PortableTextBody = [{ _type: 'musicPlayer', _key: 'm1', playerId: 'abc123' }]
    expect(bodyToPlainText(body)).toBe('[Music: abc123]')
  })

  it('descends into solution and footnoteDefinition children', () => {
    const body: PortableTextBody = [
      {
        _type: 'solution',
        _key: 'sol',
        children: [textBlock('solution text')],
      },
      {
        _type: 'footnoteDefinition',
        _key: 'fn',
        index: 1,
        children: [textBlock('footnote text')],
      },
    ]
    expect(bodyToPlainText(body)).toBe('solution text\nfootnote text')
  })

  it('descends into twoColumn left and right', () => {
    const body: PortableTextBody = [
      {
        _type: 'twoColumn',
        _key: 'tc',
        left: [textBlock('left')],
        right: [textBlock('right')],
      },
    ]
    expect(bodyToPlainText(body)).toBe('left\nright')
  })
})

// --- validation -----------------------------------------------------------

describe('shared/pt/utils — validation', () => {
  it('validatePortableTextBody returns parsed body for valid input', () => {
    const body = [{ _type: 'horizontalRule', _key: 'h1' }]
    const parsed = validatePortableTextBody(body)
    expect(parsed).toHaveLength(1)
  })

  it('validatePortableTextBody throws ZodError on invalid input', () => {
    expect(() => validatePortableTextBody([{ foo: 'bar' }])).toThrow()
  })

  it('safeValidatePortableTextBody returns ok envelope for valid input', () => {
    const result = safeValidatePortableTextBody([{ _type: 'horizontalRule', _key: 'h1' }])
    expect(result.ok).toBe(true)
  })

  it('safeValidatePortableTextBody returns error envelope for invalid input', () => {
    const result = safeValidatePortableTextBody([{ foo: 'bar' }])
    expect(result.ok).toBe(false)
  })
})
