import { describe, expect, it } from 'vitest'

import type { Block, NonRecursiveBlock, PortableTextBody, TextBlock } from '@/shared/pt/schema'

import {
  bodyToPlainText,
  buildHeadingIdByBlockKey,
  collectHeadings,
  collectHeadingSlotsInPortableTextRenderOrder,
  collectImageStoragePaths,
  collectMusicPlayerIds,
  generateBlockKey,
  mapNestedBlocks,
  safeValidatePortableTextBody,
  validatePortableTextBody,
  visitNestedBlocks,
} from '@/shared/pt/utils'

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

describe('shared/pt/utils — visitNestedBlocks', () => {
  it('yields nothing for an empty body', () => {
    const seen: string[] = []
    visitNestedBlocks([], (block) => {
      seen.push(block._key)
    })
    expect(seen).toEqual([])
  })

  it('visits every block pre-order: body order, containers first, children, left before right', () => {
    const body: PortableTextBody = [
      { _type: 'block', _key: 'b1', children: [{ _type: 'span', _key: 's1', text: 'lead' }] },
      {
        _type: 'solution',
        _key: 'sol1',
        children: [
          { _type: 'block', _key: 'b2', children: [{ _type: 'span', _key: 's2', text: 'sol' }] },
          { _type: 'image', _key: 'i1', src: 'x' },
        ],
      },
      {
        _type: 'twoColumn',
        _key: 'tc1',
        left: [{ _type: 'code', _key: 'c1', code: 'left' }],
        right: [{ _type: 'mathBlock', _key: 'm1', tex: 'right' }],
      },
      {
        _type: 'footnoteDefinition',
        _key: 'fn1',
        index: 1,
        children: [{ _type: 'musicPlayer', _key: 'mp1', playerId: 'p1' }],
      },
      { _type: 'horizontalRule', _key: 'hr1' },
    ]
    const seen: string[] = []
    visitNestedBlocks(body, (block) => {
      seen.push(`${block._type}:${block._key}`)
    })
    expect(seen).toEqual([
      'block:b1',
      'solution:sol1',
      'block:b2',
      'image:i1',
      'twoColumn:tc1',
      'code:c1',
      'mathBlock:m1',
      'footnoteDefinition:fn1',
      'musicPlayer:mp1',
      'horizontalRule:hr1',
    ])
  })

  it('visits empty containers without descending', () => {
    const body: PortableTextBody = [
      { _type: 'solution', _key: 'sol1', children: [] },
      { _type: 'twoColumn', _key: 'tc1', left: [], right: [] },
    ]
    const seen: string[] = []
    visitNestedBlocks(body, (block) => {
      seen.push(block._key)
    })
    expect(seen).toEqual(['sol1', 'tc1'])
  })
})

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

describe('shared/pt/utils — mapNestedBlocks', () => {
  it('maps every block exactly once in pre-order: container first, then children, left before right', () => {
    const body: PortableTextBody = [
      { _type: 'block', _key: 'b1', children: [{ _type: 'span', _key: 's1', text: 'lead' }] },
      {
        _type: 'solution',
        _key: 'sol1',
        children: [
          { _type: 'block', _key: 'b2', children: [{ _type: 'span', _key: 's2', text: 'sol' }] },
          { _type: 'image', _key: 'i1', src: 'x' },
        ],
      },
      {
        _type: 'twoColumn',
        _key: 'tc1',
        left: [{ _type: 'code', _key: 'c1', code: 'left' }],
        right: [{ _type: 'mathBlock', _key: 'm1', tex: 'right' }],
      },
      {
        _type: 'footnoteDefinition',
        _key: 'fn1',
        index: 1,
        children: [{ _type: 'musicPlayer', _key: 'mp1', playerId: 'p1' }],
      },
    ]
    const seen: string[] = []
    const result = mapNestedBlocks(body, (block) => {
      seen.push(`${block._type}:${block._key}`)
      return block
    })
    expect(seen).toEqual([
      'block:b1',
      'solution:sol1',
      'block:b2',
      'image:i1',
      'twoColumn:tc1',
      'code:c1',
      'mathBlock:m1',
      'footnoteDefinition:fn1',
      'musicPlayer:mp1',
    ])
    // Identity-preserving callback returns an equal-but-new body.
    expect(result).toEqual(body)
  })

  it('rewrites nested blocks through the same callback', () => {
    const body: PortableTextBody = [
      {
        _type: 'twoColumn',
        _key: 'tc1',
        left: [{ _type: 'image', _key: 'i1', src: 'a' }],
        right: [],
      },
      {
        _type: 'footnoteDefinition',
        _key: 'fn1',
        index: 1,
        children: [{ _type: 'image', _key: 'i2', src: 'b' }],
      },
    ]
    const result = mapNestedBlocks(body, (block) =>
      block._type === 'image' ? { ...block, src: `${block.src}-mapped` } : block,
    )
    const tc = result[0] as Extract<Block, { _type: 'twoColumn' }>
    expect((tc.left[0] as { src: string }).src).toBe('a-mapped')
    const fn = result[1] as Extract<Block, { _type: 'footnoteDefinition' }>
    expect((fn.children[0] as { src: string }).src).toBe('b-mapped')
    // The original body is untouched.
    expect((body[0] as Extract<Block, { _type: 'twoColumn' }>).left[0]).toMatchObject({ src: 'a' })
  })

  it('keeps leaf identity while containers always get fresh objects', () => {
    const leaf = textBlock('leaf')
    const container = { _type: 'solution', _key: 'sol', children: [leaf] } as Extract<Block, { _type: 'solution' }>
    const body: PortableTextBody = [container]
    const result = mapNestedBlocks(body, (block) => block)
    expect(result[0]).not.toBe(container)
    expect((result[0] as Extract<Block, { _type: 'solution' }>).children[0]).toBe(leaf)
  })
})

describe('shared/pt/utils — buildHeadingIdByBlockKey', () => {
  it('zips slots with the precomputed slugs by render order', () => {
    const body: PortableTextBody = [textBlock('Alpha', 'h2'), textBlock('Beta', 'h3')]
    const map = buildHeadingIdByBlockKey(body, ['custom-a', 'custom-b'], (text) => `fb-${text}`)
    expect(map.size).toBe(2)
    const [a, b] = collectHeadingSlotsInPortableTextRenderOrder(body)
    expect(map.get(a!.blockKey)).toBe('custom-a')
    expect(map.get(b!.blockKey)).toBe('custom-b')
  })

  it('falls back to the derived slug when the precomputed slot is missing or empty', () => {
    const body: PortableTextBody = [textBlock('Alpha', 'h2'), textBlock('Beta', 'h2')]
    const seen: string[] = []
    // Revision preview passes `[]`; empty strings fall back too.
    const map = buildHeadingIdByBlockKey(body, ['', 'kept'], (text) => {
      seen.push(text)
      return `fb-${text}`
    })
    const [a, b] = collectHeadingSlotsInPortableTextRenderOrder(body)
    expect(map.get(a!.blockKey)).toBe('fb-Alpha')
    expect(map.get(b!.blockKey)).toBe('kept')
    expect(seen).toEqual(['Alpha'])
  })

  it('uses the fallback for every slot when headingSlugs is undefined', () => {
    const body: PortableTextBody = [textBlock('Only', 'h1')]
    const map = buildHeadingIdByBlockKey(body, undefined, () => 'derived')
    const [slot] = collectHeadingSlotsInPortableTextRenderOrder(body)
    expect(map.get(slot!.blockKey)).toBe('derived')
  })

  it('covers footnote-definition headings after the main column', () => {
    const body: PortableTextBody = [
      textBlock('Main', 'h2'),
      {
        _type: 'footnoteDefinition',
        _key: 'fn1',
        index: 1,
        children: [textBlock('InNote', 'h3')],
      },
    ]
    const map = buildHeadingIdByBlockKey(body, ['main-slug', 'note-slug'], () => 'fb')
    const slots = collectHeadingSlotsInPortableTextRenderOrder(body)
    expect(map.get(slots[0]!.blockKey)).toBe('main-slug')
    expect(map.get(slots[1]!.blockKey)).toBe('note-slug')
  })
})

describe('shared/pt/utils — collectMusicPlayerIds', () => {
  it('collects player ids deduped in first-seen order', () => {
    const body: PortableTextBody = [
      { _type: 'musicPlayer', _key: 'm1', playerId: 'p1' },
      { _type: 'musicPlayer', _key: 'm2', playerId: 'p2' },
      { _type: 'musicPlayer', _key: 'm3', playerId: 'p1' },
    ]
    expect(collectMusicPlayerIds(body)).toEqual(['p1', 'p2'])
  })

  it('descends into solution, footnoteDefinition, and twoColumn children', () => {
    const body: PortableTextBody = [
      {
        _type: 'solution',
        _key: 'sol',
        children: [{ _type: 'musicPlayer', _key: 'm1', playerId: 'p-sol' }],
      },
      {
        _type: 'footnoteDefinition',
        _key: 'fn',
        index: 1,
        children: [{ _type: 'musicPlayer', _key: 'm2', playerId: 'p-fn' }],
      },
      {
        _type: 'twoColumn',
        _key: 'tc',
        left: [{ _type: 'musicPlayer', _key: 'm3', playerId: 'p-left' }],
        right: [{ _type: 'musicPlayer', _key: 'm4', playerId: 'p-right' }],
      },
    ]
    expect(collectMusicPlayerIds(body)).toEqual(['p-sol', 'p-fn', 'p-left', 'p-right'])
  })

  it('returns an empty list when no music players exist', () => {
    expect(collectMusicPlayerIds([textBlock('no music')])).toEqual([])
  })
})

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
