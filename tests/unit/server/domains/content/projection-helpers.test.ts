import { describe, expect, it } from 'vitest'

import type { ContentRow } from '@/server/infra/db/types'

import { emptyLexicalBody, lexicalBodyWith, lexicalParagraph } from '#/_helpers/lexical'

const { readBody, readHeadings, readRevisionProjection } = await import('@/server/domains/content/projection-helpers')

function revisionRow(overrides: Partial<ContentRow>): ContentRow {
  // Only the columns the projection reads matter here.
  return { body: [], bodyHtml: null, imageSources: [], headings: [], ...overrides } as ContentRow
}

describe('content/projection-helpers — readRevisionProjection (R13 body routing)', () => {
  it('returns every field empty for a null revision', () => {
    expect(readRevisionProjection(null)).toEqual({
      body: [],
      bodyHtml: null,
      bodyState: null,
      imageSources: [],
      headings: [],
    })
  })

  it('keeps strict PortableText validation for legacy array bodies', () => {
    const body = [
      {
        _type: 'block',
        _key: 'b1',
        style: 'normal',
        children: [{ _type: 'span', _key: 's1', text: 'Hello' }],
        markDefs: [],
      },
    ]
    const result = readRevisionProjection(revisionRow({ body }))
    expect(result.body).toEqual(body)
    // PT-era rows predate the projection columns — no compute-on-read state.
    expect(result.bodyHtml).toBeNull()
    expect(result.bodyState).toBeNull()
  })

  it('still throws for a corrupted legacy array body', () => {
    expect(() => readRevisionProjection(revisionRow({ body: [{ _type: 'nope' }] }))).toThrow()
  })

  it('surfaces the saved body_html projection for Lexical rows', () => {
    const state = emptyLexicalBody()
    const result = readRevisionProjection(revisionRow({ body: state, bodyHtml: '<p>hi</p>' }))
    expect(result.bodyHtml).toBe('<p>hi</p>')
    // PT consumers (feeds until R14) get an empty body instead of a 500.
    expect(result.body).toEqual([])
    // No fallback needed — bodyState stays null when the projection exists.
    expect(result.bodyState).toBeNull()
  })

  it('parses the Lexical state for the compute-on-read fallback when body_html is NULL', () => {
    const state = lexicalBodyWith([lexicalParagraph('hello')])
    const result = readRevisionProjection(revisionRow({ body: state, bodyHtml: null }))
    expect(result.body).toEqual([])
    expect(result.bodyHtml).toBeNull()
    expect(result.bodyState).toEqual(state)
  })

  it('degrades to empty output for an unparseable blob — never throws', () => {
    const result = readRevisionProjection(revisionRow({ body: { root: 'broken' }, bodyHtml: null }))
    expect(result.body).toEqual([])
    expect(result.bodyHtml).toBeNull()
    expect(result.bodyState).toBeNull()
  })
})

describe('content/projection-helpers — readBody', () => {
  it('returns empty array for null', () => {
    expect(readBody(null)).toEqual([])
  })

  it('returns empty array for undefined', () => {
    expect(readBody(undefined)).toEqual([])
  })

  it('returns validated body for a valid portable text array', () => {
    const body = [
      {
        _type: 'block',
        _key: 'b1',
        style: 'normal',
        children: [{ _type: 'span', _key: 's1', text: 'Hello' }],
        markDefs: [],
      },
    ]
    const result = readBody(body)
    expect(result).toEqual(body)
  })

  it('throws for an invalid non-array value (defensive read path)', () => {
    // validatePortableTextBody throws ZodError for non-array input
    expect(() => readBody('not an array')).toThrow()
  })
})

describe('content/projection-helpers — readHeadings', () => {
  it('returns empty array for non-array input', () => {
    expect(readHeadings(null)).toEqual([])
    expect(readHeadings(undefined)).toEqual([])
    expect(readHeadings('string')).toEqual([])
    expect(readHeadings(42)).toEqual([])
  })

  it('returns empty array for empty array input', () => {
    expect(readHeadings([])).toEqual([])
  })

  it('filters out entries that are not objects', () => {
    expect(readHeadings([null, 42, 'str', true])).toEqual([])
  })

  it('filters out entries missing depth or text', () => {
    const input = [{ depth: 2 }, { text: 'Hi' }, { depth: 'not-number', text: 'Hi' }]
    expect(readHeadings(input)).toEqual([])
  })

  it('returns valid headings with slug when provided', () => {
    const input = [{ depth: 2, text: 'Introduction', slug: 'introduction' }]
    expect(readHeadings(input)).toEqual([{ depth: 2, text: 'Introduction', slug: 'introduction' }])
  })

  it('defaults slug to empty string when not a string', () => {
    const input = [{ depth: 1, text: 'Title', slug: 123 }]
    expect(readHeadings(input)).toEqual([{ depth: 1, text: 'Title', slug: '' }])
  })

  it('defaults slug to empty string when missing', () => {
    const input = [{ depth: 3, text: 'Section' }]
    expect(readHeadings(input)).toEqual([{ depth: 3, text: 'Section', slug: '' }])
  })

  it('filters mixed valid and invalid entries', () => {
    const input = [
      { depth: 2, text: 'Valid', slug: 'valid' },
      { depth: 'two', text: 'Invalid depth' },
      { depth: 1, text: 42 },
      { depth: 3, text: 'Also Valid' },
    ]
    expect(readHeadings(input)).toEqual([
      { depth: 2, text: 'Valid', slug: 'valid' },
      { depth: 3, text: 'Also Valid', slug: '' },
    ])
  })
})
