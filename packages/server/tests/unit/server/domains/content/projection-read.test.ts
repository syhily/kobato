import type { ContentRow } from '@kobato/db/sqlite/types'

import { emptyLexicalBody, lexicalBodyWith, lexicalParagraph } from '@kobato/server/tests/utils/lexical'
import { describe, expect, it } from 'vitest'

const { readHeadings, readRevisionProjection } = await import('@kobato/server/domains/content/projection-read')

function revisionRow(overrides: Partial<ContentRow>): ContentRow {
  return { body: [], bodyHtml: null, bodyHtmlFeed: null, imageSources: [], headings: [], ...overrides } as ContentRow
}

describe('content/projection-read — readRevisionProjection (body routing)', () => {
  it('returns every field empty for a null revision', () => {
    expect(readRevisionProjection(null)).toEqual({
      bodyHtml: null,
      bodyHtmlFeed: null,
      bodyState: null,
      imageSources: [],
      headings: [],
    })
  })

  it('no longer surfaces legacy array bodies to any read path', () => {
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
    expect(result.bodyHtml).toBeNull()
    expect(result.bodyHtmlFeed).toBeNull()
    expect(result.bodyState).toBeNull()
  })

  it('no longer validates (or throws on) a corrupted legacy array body', () => {
    const result = readRevisionProjection(revisionRow({ body: [{ _type: 'nope' }] }))
    expect(result.bodyHtml).toBeNull()
    expect(result.bodyHtmlFeed).toBeNull()
    expect(result.bodyState).toBeNull()
  })

  it('surfaces the saved body_html / body_html_feed projections for Lexical rows', () => {
    const state = emptyLexicalBody()
    const result = readRevisionProjection(
      revisionRow({ body: state, bodyHtml: '<p>hi</p>', bodyHtmlFeed: '<p>hi</p>' }),
    )
    expect(result.bodyHtml).toBe('<p>hi</p>')
    expect(result.bodyHtmlFeed).toBe('<p>hi</p>')
    expect(result.bodyState).toBeNull()
  })

  it('parses the Lexical state for the compute-on-read fallback when a projection column is NULL', () => {
    const state = lexicalBodyWith([lexicalParagraph('hello')])
    const result = readRevisionProjection(revisionRow({ body: state, bodyHtml: null, bodyHtmlFeed: null }))
    expect(result.bodyHtml).toBeNull()
    expect(result.bodyHtmlFeed).toBeNull()
    expect(result.bodyState).toEqual(state)
  })

  it('degrades to empty output for an unparseable blob — never throws', () => {
    const result = readRevisionProjection(revisionRow({ body: { root: 'broken' }, bodyHtml: null }))
    expect(result.bodyHtml).toBeNull()
    expect(result.bodyHtmlFeed).toBeNull()
    expect(result.bodyState).toBeNull()
  })
})

describe('content/projection-read — readHeadings', () => {
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
