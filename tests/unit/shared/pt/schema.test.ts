import { describe, expect, it } from 'vitest'

import { portableTextBodySchema, type Block, type NonRecursiveBlock, type PortableTextBody } from '@/shared/pt/schema'
import {
  bodyToPlainText,
  collectHeadings,
  collectImageStoragePaths,
  safeValidatePortableTextBody,
  validatePortableTextBody,
} from '@/shared/pt/utils'

// Pin the in-repo PortableText dialect. Every editor save and every
// SSR render parses through `portableTextBodySchema`, so drift here
// either lets malformed payloads land in `content.body` (the editor
// then silently corrupts pages) or rejects valid revisions (the
// public site goes blank). The constants below are the canonical
// shape every other layer should mirror.

function span(text: string, marks?: string[]) {
  return { _type: 'span' as const, _key: `s-${text.slice(0, 4)}`, text, marks }
}

const HELLO_PARAGRAPH: Block = {
  _type: 'block',
  _key: 'b1',
  style: 'normal',
  children: [span('Hello '), span('world', ['strong'])],
}

const HEADING_H2: Block = {
  _type: 'block',
  _key: 'h1',
  style: 'h2',
  children: [span('Section title')],
}

const IMAGE: Block = {
  _type: 'image',
  _key: 'i1',
  src: 'https://cdn.example/path.jpg',
  storagePath: 'images/2026/05/2026050214321999.jpg',
  alt: 'Cover',
  width: 1280,
  height: 720,
}

const CODE: Block = {
  _type: 'code',
  _key: 'c1',
  code: 'console.log(1)\n',
  language: 'ts',
}

const MUSIC: Block = {
  _type: 'musicPlayer',
  _key: 'm1',
  playerId: '7hk2pqrxyzabc012',
  auto: false,
  center: true,
}

const SOLUTION: Block = {
  _type: 'solution',
  _key: 'sol1',
  children: [
    {
      _type: 'block',
      _key: 'sol-b1',
      style: 'normal',
      children: [span('Therefore '), span('x = 1', ['code'])],
    },
  ],
}

const TWO_COLUMN: Block = {
  _type: 'twoColumn',
  _key: 'tc1',
  left: [{ _type: 'block', _key: 'tcl', style: 'normal', children: [span('L')] }],
  right: [{ _type: 'block', _key: 'tcr', style: 'normal', children: [span('R')] }],
}

const FOOTNOTE_DEF: Block = {
  _type: 'footnoteDefinition',
  _key: 'fn1',
  index: 1,
  children: [{ _type: 'block', _key: 'fn-b1', style: 'normal', children: [span('See ref.')] }],
}

const PARAGRAPH_WITH_LINK: Block = {
  _type: 'block',
  _key: 'b2',
  style: 'normal',
  children: [span('See '), { _type: 'span', _key: 's-link', text: 'docs', marks: ['link-1'] }],
  markDefs: [
    {
      _type: 'link',
      _key: 'link-1',
      href: 'https://example.com',
      target: '_blank',
      rel: 'nofollow',
    },
  ],
}

const FULL_BODY: PortableTextBody = [
  HEADING_H2,
  HELLO_PARAGRAPH,
  PARAGRAPH_WITH_LINK,
  IMAGE,
  CODE,
  { _type: 'mathBlock', _key: 'math-1', tex: 'a^2 + b^2 = c^2', svg: '<svg/>' },
  { _type: 'horizontalRule', _key: 'hr-1' },
  MUSIC,
  SOLUTION,
  TWO_COLUMN,
  FOOTNOTE_DEF,
]

describe('contract: portable-text dialect — accepts the canonical block set', () => {
  it('parses every supported _type without errors', () => {
    expect(() => validatePortableTextBody(FULL_BODY)).not.toThrow()
  })

  it('an empty body is valid (newly-created doc with no draft yet)', () => {
    expect(portableTextBodySchema.parse([])).toEqual([])
  })
})

describe('contract: portable-text dialect — rejects unknown shapes', () => {
  it('rejects an unknown block _type', () => {
    const bad = [{ _type: 'unknown-block', _key: 'x' }]
    const result = safeValidatePortableTextBody(bad)
    expect(result.ok).toBe(false)
  })

  it('rejects a block with no _key', () => {
    const bad = [{ _type: 'block', children: [span('x')] }]
    expect(safeValidatePortableTextBody(bad).ok).toBe(false)
  })

  it('rejects a span with empty _key', () => {
    const bad: unknown = [
      {
        _type: 'block',
        _key: 'b',
        children: [{ _type: 'span', _key: '', text: 'x' }],
      },
    ]
    expect(safeValidatePortableTextBody(bad).ok).toBe(false)
  })

  it('rejects an unknown markDef _type', () => {
    const bad: unknown = [
      {
        _type: 'block',
        _key: 'b',
        children: [span('x', ['m1'])],
        markDefs: [{ _type: 'unknown-mark', _key: 'm1' }],
      },
    ]
    expect(safeValidatePortableTextBody(bad).ok).toBe(false)
  })

  it('rejects link hrefs with disallowed protocols, including control-char smuggling', () => {
    for (const href of ['javascript:alert(1)', 'data:text/html,<script>', 'java\tscript:alert(1)']) {
      const bad: unknown = [
        {
          _type: 'block',
          _key: 'b',
          children: [span('x', ['m1'])],
          markDefs: [{ _type: 'link', _key: 'm1', href }],
        },
      ]
      expect(safeValidatePortableTextBody(bad).ok).toBe(false)
    }
  })

  it('rejects a heading style outside h1-h4', () => {
    const bad: unknown = [
      {
        _type: 'block',
        _key: 'b',
        style: 'h5',
        children: [span('x')],
      },
    ]
    expect(safeValidatePortableTextBody(bad).ok).toBe(false)
  })

  it('rejects a solution that nests another solution (one-deep recursion)', () => {
    const bad: Block = {
      _type: 'solution',
      _key: 'sol-outer',
      children: [SOLUTION as unknown as NonRecursiveBlock],
    }
    expect(safeValidatePortableTextBody([bad]).ok).toBe(false)
  })

  it('rejects a footnoteDefinition that nests a solution', () => {
    const bad: Block = {
      _type: 'footnoteDefinition',
      _key: 'fn-outer',
      index: 1,
      children: [SOLUTION as unknown as NonRecursiveBlock],
    }
    expect(safeValidatePortableTextBody([bad]).ok).toBe(false)
  })

  it('rejects a twoColumn that nests another twoColumn', () => {
    const inner: Block = {
      _type: 'twoColumn',
      _key: 'tc-inner',
      left: [{ _type: 'block', _key: 'x', style: 'normal', children: [span('x')] }],
      right: [],
    }
    const bad: Block = {
      _type: 'twoColumn',
      _key: 'tc-outer',
      left: [inner as unknown as NonRecursiveBlock],
      right: [],
    }
    expect(safeValidatePortableTextBody([bad]).ok).toBe(false)
  })
})

describe('contract: portable-text helpers', () => {
  it('collectHeadings walks solution innards then later top-level blocks (render order)', () => {
    const body: PortableTextBody = [
      { _type: 'block', _key: 'h-outer-1', style: 'h2', children: [span('A')] },
      {
        _type: 'solution',
        _key: 'sol',
        children: [{ _type: 'block', _key: 'h-in-sol', style: 'h3', children: [span('B')] }],
      },
      { _type: 'block', _key: 'h-outer-2', style: 'h2', children: [span('C')] },
    ]
    expect(collectHeadings(body).map((h) => h.text)).toEqual(['A', 'B', 'C'])
  })

  it('collectHeadings walks twoColumn left then right before later top-level blocks', () => {
    const body: PortableTextBody = [
      { _type: 'block', _key: 'h0', style: 'h2', children: [span('Outer')] },
      {
        _type: 'twoColumn',
        _key: 'tc',
        left: [{ _type: 'block', _key: 'hl', style: 'h3', children: [span('Left col')] }],
        right: [{ _type: 'block', _key: 'hr', style: 'h3', children: [span('Right col')] }],
      },
      { _type: 'block', _key: 'hlast', style: 'h2', children: [span('After')] },
    ]
    expect(collectHeadings(body).map((h) => h.text)).toEqual(['Outer', 'Left col', 'Right col', 'After'])
  })

  it('collectHeadings places footnote definition headings after the main column', () => {
    const body: PortableTextBody = [
      { _type: 'block', _key: 'h1', style: 'h2', children: [span('Main')] },
      {
        _type: 'footnoteDefinition',
        _key: 'fn1',
        index: 1,
        children: [{ _type: 'block', _key: 'h-fn', style: 'h3', children: [span('Note')] }],
      },
    ]
    expect(collectHeadings(body).map((h) => h.text)).toEqual(['Main', 'Note'])
  })

  it('collectHeadings emits depth + text + github-slugger slug for h1-h4 styled blocks only', () => {
    const headings = collectHeadings(FULL_BODY)
    expect(headings).toEqual([{ depth: 2, text: 'Section title', slug: 'section-title' }])
  })

  it('collectHeadings disambiguates duplicate text with -1, -2, ... suffixes (matches rehype-slug)', () => {
    const body: PortableTextBody = [
      { _type: 'block', _key: 'h1', style: 'h2', children: [span('Intro')] },
      { _type: 'block', _key: 'h2', style: 'h2', children: [span('Intro')] },
      { _type: 'block', _key: 'h3', style: 'h3', children: [span('Intro')] },
    ]
    const headings = collectHeadings(body)
    expect(headings.map((h) => h.slug)).toEqual(['intro', 'intro-1', 'intro-2'])
  })

  it('collectHeadings ignores blockquote / normal styles', () => {
    const body: PortableTextBody = [
      { _type: 'block', _key: 'b', style: 'blockquote', children: [span('quote')] },
      { _type: 'block', _key: 'b2', style: 'normal', children: [span('plain')] },
    ]
    expect(collectHeadings(body)).toEqual([])
  })

  it('collectImageStoragePaths walks solution / footnoteDefinition children', () => {
    const body: PortableTextBody = [
      IMAGE,
      {
        _type: 'solution',
        _key: 'sol',
        children: [{ _type: 'image', _key: 'i2', src: 'a', storagePath: 'images/inside-solution.jpg' }],
      },
      {
        _type: 'footnoteDefinition',
        _key: 'fn',
        index: 1,
        children: [{ _type: 'image', _key: 'i3', src: 'b', storagePath: 'images/inside-footnote.jpg' }],
      },
    ]
    const paths = collectImageStoragePaths(body)
    expect(paths.sort()).toEqual([
      'images/2026/05/2026050214321999.jpg',
      'images/inside-footnote.jpg',
      'images/inside-solution.jpg',
    ])
  })

  it('collectImageStoragePaths dedupes identical paths', () => {
    const body: PortableTextBody = [IMAGE, { ...IMAGE, _key: 'i-dup' }]
    expect(collectImageStoragePaths(body)).toEqual([IMAGE.storagePath])
  })

  it('bodyToPlainText concatenates text/code/math but skips images without alt', () => {
    const body: PortableTextBody = [
      HEADING_H2,
      HELLO_PARAGRAPH,
      CODE,
      { _type: 'mathBlock', _key: 'm', tex: 'E=mc^2' },
      { _type: 'image', _key: 'i', src: 'a' },
      { _type: 'image', _key: 'i2', src: 'b', alt: 'cover alt' },
    ]
    const text = bodyToPlainText(body)
    expect(text).toContain('Section title')
    expect(text).toContain('Hello world')
    expect(text).toContain('console.log(1)')
    expect(text).toContain('E=mc^2')
    expect(text).toContain('cover alt')
  })
})
