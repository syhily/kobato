import { describe, expect, it } from 'vitest'

import { emptyInklingDocument, inklingFromPt } from '#/_helpers/inkling'

const { readBody, readHeadings } = await import('@/server/domains/content/projection-helpers')

describe('content/projection-helpers — readBody', () => {
  it('returns an empty Inkling document for null', () => {
    expect(readBody(null)).toEqual(emptyInklingDocument())
  })

  it('returns an empty Inkling document for undefined', () => {
    expect(readBody(undefined)).toEqual(emptyInklingDocument())
  })

  it('returns a validated Inkling document for a valid Inkling document', () => {
    const body = inklingFromPt([
      {
        _type: 'block',
        _key: 'b1',
        style: 'normal',
        children: [{ _type: 'span', _key: 's1', text: 'Hello' }],
        markDefs: [],
      },
    ])
    const result = readBody(body)
    expect(result).toEqual(body)
  })

  it('throws for an invalid non-object value (defensive read path)', () => {
    // validateInklingDocument throws ZodError for non-object input
    expect(() => readBody('not an object')).toThrow()
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
