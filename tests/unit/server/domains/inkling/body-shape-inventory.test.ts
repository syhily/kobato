import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import {
  collectBodyShapeStats,
  collectValidationIssuePaths,
  mergeBodyShapeStats,
  redactPortableTextBodyShape,
} from '@/server/domains/inkling/poc/body-shape-inventory'

const SECRET_TEXT = 'This is a secret sentence.'
const SECRET_URL = 'https://example.com/secret/path?token=abc'

function makeArticleBody(): unknown[] {
  return [
    {
      _type: 'block',
      _key: 'b1',
      style: 'h1',
      children: [{ _type: 'span', _key: 's1', text: SECRET_TEXT, marks: ['strong'] }],
    },
    {
      _type: 'block',
      _key: 'b2',
      style: 'normal',
      children: [
        { _type: 'span', _key: 's2', text: 'See ', marks: [] },
        {
          _type: 'span',
          _key: 's3',
          text: 'docs',
          marks: ['m1'],
        },
      ],
      markDefs: [{ _type: 'link', _key: 'm1', href: SECRET_URL, target: '_blank' }],
    },
    {
      _type: 'image',
      _key: 'b3',
      src: SECRET_URL,
      alt: 'A secret image',
      caption: 'Secret caption',
      layout: 'center',
      width: 800,
      height: 600,
    },
    {
      _type: 'code',
      _key: 'b4',
      code: 'const secret = "hidden";',
      language: 'ts',
      highlightedHtml: '<pre>secret</pre>',
    },
    {
      _type: 'mathBlock',
      _key: 'b5',
      tex: '\\int_0^1 x dx',
      mathml: '<math>secret</math>',
      svg: '<svg>secret</svg>',
    },
    {
      _type: 'musicPlayer',
      _key: 'b6',
      playerId: '7hk2pqrxyzabc012',
      auto: true,
      center: false,
    },
    {
      _type: 'horizontalRule',
      _key: 'b7',
    },
    {
      _type: 'solution',
      _key: 'b8',
      children: [
        {
          _type: 'block',
          _key: 'b8c1',
          style: 'normal',
          children: [{ _type: 'span', _key: 's4', text: 'Solution text', marks: [] }],
        },
        { _type: 'code', _key: 'b8c2', code: 'nested code' },
      ],
    },
    {
      _type: 'twoColumn',
      _key: 'b9',
      left: [{ _type: 'block', _key: 'b9l1', style: 'normal', children: [] }],
      right: [{ _type: 'image', _key: 'b9r1', src: 'https://cdn.example/left.jpg' }],
    },
    {
      _type: 'footnoteDefinition',
      _key: 'b10',
      index: 1,
      children: [
        {
          _type: 'block',
          _key: 'b10c1',
          style: 'normal',
          children: [{ _type: 'span', _key: 's5', text: 'Footnote text', marks: [] }],
        },
      ],
    },
    {
      _type: 'table',
      _key: 'b11',
      rows: [
        {
          _type: 'tableRow',
          _key: 'r1',
          cells: [
            {
              _type: 'tableCell',
              _key: 'c1',
              isHeader: true,
              content: [{ _type: 'span', _key: 's6', text: 'Header', marks: [] }],
            },
            {
              _type: 'tableCell',
              _key: 'c2',
              content: [{ _type: 'span', _key: 's7', text: 'Header 2', marks: [] }],
            },
          ],
        },
        {
          _type: 'tableRow',
          _key: 'r2',
          cells: [
            {
              _type: 'tableCell',
              _key: 'c3',
              content: [{ _type: 'span', _key: 's8', text: 'Cell', marks: [] }],
            },
          ],
        },
      ],
    },
  ]
}

function makeCommentBody(): unknown[] {
  return [
    {
      _type: 'block',
      _key: 'cb1',
      style: 'blockquote',
      listItem: 'bullet',
      level: 2,
      children: [
        { _type: 'span', _key: 'cs1', text: 'Comment ', marks: ['em'] },
        { _type: 'span', _key: 'cs2', text: 'link', marks: ['cm1'] },
      ],
      markDefs: [{ _type: 'link', _key: 'cm1', href: SECRET_URL }],
    },
    { _type: 'code', _key: 'cb2', code: 'console.log("hello")' },
    { _type: 'mathBlock', _key: 'cb3', tex: 'E=mc^2' },
  ]
}

describe('server/domains/inkling/poc/body-shape-inventory — redaction', () => {
  it('removes raw text from spans', () => {
    const redacted = redactPortableTextBodyShape(makeArticleBody()) as unknown[]
    const firstBlock = redacted[0] as Record<string, unknown>
    const span = (firstBlock.children as unknown[])[0] as Record<string, unknown>
    expect(span.text).toEqual({ kind: 'text', length: SECRET_TEXT.length, blank: false })
  })

  it('removes raw URLs from link markDefs', () => {
    const redacted = redactPortableTextBodyShape(makeArticleBody()) as unknown[]
    const secondBlock = redacted[1] as Record<string, unknown>
    const linkMark = (secondBlock.markDefs as unknown[])[0] as Record<string, unknown>
    expect(linkMark.href).toEqual({ kind: 'string', type: 'href', length: SECRET_URL.length })
    expect(linkMark.target).toBe('_blank')
  })

  it('removes raw URLs and alt/caption from image blocks', () => {
    const redacted = redactPortableTextBodyShape(makeArticleBody()) as unknown[]
    const image = redacted[2] as Record<string, unknown>
    expect(image.src).toEqual({ kind: 'string', type: 'src', length: SECRET_URL.length })
    expect(image.alt).toEqual({ kind: 'string', type: 'alt', length: 'A secret image'.length })
    expect(image.caption).toEqual({ kind: 'string', type: 'caption', length: 'Secret caption'.length })
    expect(image.layout).toBe('center')
    expect(image.width).toBe(800)
  })

  it('removes raw code, mathml, and svg from code/math blocks', () => {
    const redacted = redactPortableTextBodyShape(makeArticleBody()) as unknown[]
    const code = redacted[3] as Record<string, unknown>
    expect(code.code).toEqual({ kind: 'string', type: 'code', length: 'const secret = "hidden";'.length })
    expect(code.highlightedHtml).toEqual({
      kind: 'string',
      type: 'highlightedHtml',
      length: '<pre>secret</pre>'.length,
    })
    expect(code.language).toBe('ts')

    const math = redacted[4] as Record<string, unknown>
    expect(math.tex).toEqual({ kind: 'string', type: 'tex', length: '\\int_0^1 x dx'.length })
    expect(math.svg).toEqual({ kind: 'string', type: 'svg', length: '<svg>secret</svg>'.length })
  })

  it('preserves structural _type keys throughout', () => {
    const redacted = redactPortableTextBodyShape(makeArticleBody()) as unknown[]
    const types = new Set<string>()
    const queue: unknown[] = [...redacted]
    while (queue.length > 0) {
      const current = queue.shift()
      if (Array.isArray(current)) {
        queue.push(...current)
      } else if (isPlainObject(current)) {
        if (typeof current._type === 'string') {
          types.add(current._type)
        }
        for (const value of Object.values(current)) {
          queue.push(value)
        }
      }
    }
    expect(types).toContain('block')
    expect(types).toContain('span')
    expect(types).toContain('link')
    expect(types).toContain('image')
    expect(types).toContain('code')
    expect(types).toContain('mathBlock')
    expect(types).toContain('musicPlayer')
    expect(types).toContain('horizontalRule')
    expect(types).toContain('solution')
    expect(types).toContain('twoColumn')
    expect(types).toContain('footnoteDefinition')
    expect(types).toContain('table')
    expect(types).toContain('tableRow')
    expect(types).toContain('tableCell')
  })

  it('contains no raw secret strings anywhere in the serialized redaction', () => {
    const redacted = redactPortableTextBodyShape(makeArticleBody())
    const json = JSON.stringify(redacted)
    expect(json).not.toContain(SECRET_TEXT)
    expect(json).not.toContain(SECRET_URL)
    expect(json).not.toContain('secret')
    expect(json).not.toContain('hidden')
  })
})

describe('server/domains/inkling/poc/body-shape-inventory — statistics', () => {
  it('counts block _types', () => {
    const stats = collectBodyShapeStats(makeArticleBody())
    expect(stats.blockTypeCounts.block).toBeGreaterThan(0)
    expect(stats.blockTypeCounts.image).toBe(1)
    expect(stats.blockTypeCounts.code).toBe(1)
    expect(stats.blockTypeCounts.mathBlock).toBe(1)
    expect(stats.blockTypeCounts.musicPlayer).toBe(1)
    expect(stats.blockTypeCounts.horizontalRule).toBe(1)
  })

  it('counts mark _types including decorators and link/mathInline', () => {
    const stats = collectBodyShapeStats(makeArticleBody())
    expect(stats.markTypeCounts.link).toBe(1)
    expect(stats.markTypeCounts.strong).toBe(1)
  })

  it('counts list types and levels from comment bodies', () => {
    const stats = collectBodyShapeStats(makeCommentBody())
    expect(stats.listTypeCounts.bullet).toBe(1)
    expect(stats.listLevelCounts['2']).toBe(1)
    expect(stats.blockStyleCounts.blockquote).toBe(1)
  })

  it('counts table dimensions', () => {
    const stats = collectBodyShapeStats(makeArticleBody())
    expect(stats.tableDimensionCounts['2x2']).toBe(1)
  })

  it('counts nested blocks under solution, twoColumn, and footnoteDefinition', () => {
    const stats = collectBodyShapeStats(makeArticleBody())
    expect(stats.nestedBlockCounts.solution?.block).toBe(1)
    expect(stats.nestedBlockCounts.solution?.code).toBe(1)
    expect(stats.nestedBlockCounts.twoColumn?.block).toBe(1)
    expect(stats.nestedBlockCounts.twoColumn?.image).toBe(1)
    expect(stats.nestedBlockCounts.footnoteDefinition?.block).toBe(1)
  })

  it('merges multiple stats aggregates', () => {
    const a = collectBodyShapeStats(makeArticleBody())
    const b = collectBodyShapeStats(makeCommentBody())
    const merged = mergeBodyShapeStats([a, b])
    expect(merged.blockTypeCounts.block).toBe(a.blockTypeCounts.block + b.blockTypeCounts.block)
    expect(merged.markTypeCounts.link).toBe(a.markTypeCounts.link + b.markTypeCounts.link)
    expect(merged.listTypeCounts.bullet).toBe(b.listTypeCounts.bullet)
  })
})

describe('server/domains/inkling/poc/body-shape-inventory — validation issue paths', () => {
  it('returns issue paths without raw payloads', () => {
    const schema = z.object({ name: z.string() })
    const result = schema.safeParse({ name: 123 })
    expect(result.success).toBe(false)
    if (result.success) {
      throw new Error('expected parse failure')
    }
    const paths = collectValidationIssuePaths(result.error)
    expect(paths).toContain('name')
    expect(JSON.stringify(paths)).not.toContain('123')
  })
})

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
