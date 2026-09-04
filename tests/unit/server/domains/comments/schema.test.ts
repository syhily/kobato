import { describe, expect, it } from 'vitest'

import { makeCommentBody } from '#/_helpers/catalog'
import {
  commentEditSchema,
  commentReplySchema,
  commentRidSchema,
  filterAutocompleteSchema,
  loadAllCommentsSchema,
  loadCommentsSchema,
} from '@/server/domains/comments/schema'

const HELLO_BODY = makeCommentBody('Thoughtful comment.')

// A Lexical state whose root holds a node outside the comment whitelist
// (headings are article-only; the comment node set excludes them).
const HEADING_BODY = {
  root: {
    type: 'root',
    version: 1,
    direction: 'ltr',
    format: '',
    indent: 0,
    children: [{ type: 'heading', version: 1 }],
  },
}

describe('commentReplySchema anti-spam', () => {
  const base = {
    page_key: '/posts/hello',
    name: 'Reader',
    email: 'reader@example.com',
    body: HELLO_BODY,
    // csrf field removed
    subtitle: '',
  }

  it('accepts a valid payload', async () => {
    const data = await commentReplySchema.parseAsync(base)
    expect(data.body).toEqual(base.body)
    expect(data.subtitle).toBe('')
  })

  it('rejects a filled honeypot field', async () => {
    await expect(commentReplySchema.parseAsync({ ...base, subtitle: 'https://spam.example/' })).rejects.toMatchObject({
      issues: expect.arrayContaining([expect.objectContaining({ path: ['subtitle'] })]),
    })
  })

  it('rejects a body with nodes outside the comment whitelist', async () => {
    await expect(commentReplySchema.parseAsync({ ...base, body: HEADING_BODY })).rejects.toBeTruthy()
  })

  it('treats missing subtitle like empty for form submissions', async () => {
    const data = await commentReplySchema.parseAsync({
      page_key: base.page_key,
      name: base.name,
      email: base.email,
      body: base.body,
    })
    expect(data.subtitle).toBe('')
  })
})

describe('commentRidSchema', () => {
  it('accepts a numeric rid', async () => {
    const data = await commentRidSchema.parseAsync({ rid: '123' })
    expect(data.rid).toBe('123')
  })

  it('rejects a non-numeric rid', async () => {
    await expect(commentRidSchema.parseAsync({ rid: 'abc' })).rejects.toBeTruthy()
  })
})

describe('commentEditSchema', () => {
  it('accepts a valid edit payload', async () => {
    const data = await commentEditSchema.parseAsync({ rid: '42', body: HELLO_BODY })
    expect(data.rid).toBe('42')
    expect(data.body).toEqual(HELLO_BODY)
  })

  it('rejects an invalid body', async () => {
    // A legacy PT array is not a Lexical editor state — old clients are rejected.
    await expect(
      commentEditSchema.parseAsync({ rid: '42', body: [{ _type: 'block', _key: 'b1' }] }),
    ).rejects.toBeTruthy()
  })
})

describe('loadCommentsSchema', () => {
  it('accepts a valid page request', async () => {
    const data = await loadCommentsSchema.parseAsync({ page_key: '/posts/hello', offset: 0 })
    expect(data).toEqual({ page_key: '/posts/hello', offset: 0 })
  })

  it('coerces offset from a string', async () => {
    const data = await loadCommentsSchema.parseAsync({ page_key: '/posts/hello', offset: '10' })
    expect(data.offset).toBe(10)
  })

  it('rejects a missing page_key', async () => {
    await expect(loadCommentsSchema.parseAsync({ offset: 0 })).rejects.toBeTruthy()
  })
})

describe('loadAllCommentsSchema', () => {
  it('accepts required fields only', async () => {
    const data = await loadAllCommentsSchema.parseAsync({ offset: 0, limit: 20 })
    expect(data).toEqual({ offset: 0, limit: 20 })
  })

  it('accepts all optional filters', async () => {
    const data = await loadAllCommentsSchema.parseAsync({
      offset: 0,
      limit: 50,
      pageKey: '/about',
      userId: 'u1',
      status: 'approved',
      q: 'hello',
      match: 'contains',
      createdAfter: '2024-01-01T00:00:00.000Z',
      createdBefore: '2024-12-31T23:59:59.000Z',
    })
    expect(data).toMatchObject({ status: 'approved', q: 'hello', match: 'contains' })
  })

  it('rejects an invalid status enum', async () => {
    await expect(loadAllCommentsSchema.parseAsync({ offset: 0, limit: 10, status: 'banned' })).rejects.toBeTruthy()
  })

  it('rejects a q string that is too long', async () => {
    await expect(loadAllCommentsSchema.parseAsync({ offset: 0, limit: 10, q: 'x'.repeat(201) })).rejects.toBeTruthy()
  })
})

describe('filterAutocompleteSchema', () => {
  it('splits ids on commas and trims whitespace', async () => {
    const data = await filterAutocompleteSchema.parseAsync({ ids: ' 1 , 2 ,3 ' })
    expect(data.ids).toEqual(['1', '2', '3'])
  })

  it('defaults limit to 20', async () => {
    const data = await filterAutocompleteSchema.parseAsync({})
    expect(data.limit).toBe(20)
  })

  it('keeps the key field', async () => {
    const data = await filterAutocompleteSchema.parseAsync({ key: 'https://example.com/about/' })
    expect(data.key).toBe('https://example.com/about/')
  })
})
