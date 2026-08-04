import { describe, expect, it } from 'vitest'

const { readBody, readHeadings } = await import('@kobato/server/domains/content/projection-helpers')

describe('content/projection-helpers — readBody (dual-shape)', () => {
  it('returns the canonical empty body for null', () => {
    expect(readBody(null)).toEqual({
      root: { direction: null, format: '', indent: 0, type: 'root', version: 1, children: [] },
    })
  })

  it('returns the canonical empty body for undefined', () => {
    expect(readBody(undefined)).toEqual(readBody(null))
  })

  it('keeps an empty stored PT body empty (no stray minimum paragraph)', () => {
    expect(readBody([])).toEqual({
      root: { direction: null, format: '', indent: 0, type: 'root', version: 1, children: [] },
    })
  })

  it('converts a pre-migration PT body to the Lexical shape', () => {
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
    expect(result.root.type).toBe('root')
    expect(result.root.children).toHaveLength(1)
    expect(result.root.children[0]).toMatchObject({ type: 'paragraph' })
    expect((result.root.children[0] as { children: unknown[] }).children).toEqual([
      { detail: 0, format: 0, mode: 'normal', style: '', text: 'Hello', type: 'text', version: 1 },
    ])
  })

  it('passes a Lexical body through the gate untouched', () => {
    const lexical = {
      root: { direction: null, format: '', indent: 0, type: 'root', version: 1, children: [] },
    }
    expect(readBody(lexical)).toEqual(lexical)
  })

  it('falls back to an empty body for an invalid value (defensive read path)', () => {
    expect(readBody('not an array')).toEqual(readBody(null))
    expect(readBody(42)).toEqual(readBody(null))
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
