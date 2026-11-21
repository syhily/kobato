import {
  ADMIN_COMMENT_STATUSES,
  COMMENT_TEXT_MATCHES,
  adminCommentsLoadAllInput,
  commentEditInputSchema,
  commentListInputSchema,
  commentReplySchema,
  commentRidSchema,
} from '@kobato/contracts/comments'
import { makeCommentBody } from '@kobato/contracts/tests/utils/catalog'
import { describe, expect, it } from 'vitest'

const HELLO_BODY = makeCommentBody('Thoughtful comment.')

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

describe('commentEditInputSchema', () => {
  it('accepts a valid edit payload', async () => {
    const data = await commentEditInputSchema.parseAsync({ rid: '42', body: HELLO_BODY })
    expect(data.rid).toBe('42')
    expect(data.body).toEqual(HELLO_BODY)
  })

  it('rejects an invalid body', async () => {
    await expect(
      commentEditInputSchema.parseAsync({ rid: '42', body: [{ _type: 'block', _key: 'b1' }] }),
    ).rejects.toBeTruthy()
  })

  it('rejects a non-numeric rid like commentRidSchema', async () => {
    await expect(commentEditInputSchema.parseAsync({ rid: 'abc', body: HELLO_BODY })).rejects.toBeTruthy()
  })
})

describe('commentListInputSchema', () => {
  it('accepts a valid page request', async () => {
    const data = await commentListInputSchema.parseAsync({ page_key: '/posts/hello', offset: 0 })
    expect(data).toEqual({ page_key: '/posts/hello', offset: 0 })
  })

  it('rejects a string offset — the procedure contract takes a number, no coercion', async () => {
    await expect(commentListInputSchema.parseAsync({ page_key: '/posts/hello', offset: '10' })).rejects.toBeTruthy()
  })

  it('rejects a missing page_key', async () => {
    await expect(commentListInputSchema.parseAsync({ offset: 0 })).rejects.toBeTruthy()
  })
})

describe('adminCommentsLoadAllInput status/match vocabulary', () => {
  it('exposes the admin status and text-match constants in wire order', () => {
    expect([...ADMIN_COMMENT_STATUSES]).toEqual(['all', 'pending', 'approved', 'deleteRequested'])
    expect([...COMMENT_TEXT_MATCHES]).toEqual(['contains', 'does-not-contain'])
  })

  it('accepts every admin status and rejects unknown ones', async () => {
    for (const status of ADMIN_COMMENT_STATUSES) {
      const data = await adminCommentsLoadAllInput.parseAsync({ offset: 0, limit: 20, status })
      expect(data.status).toBe(status)
    }
    await expect(adminCommentsLoadAllInput.parseAsync({ offset: 0, limit: 20, status: 'banned' })).rejects.toBeTruthy()
  })

  it('accepts every text match and rejects unknown ones', async () => {
    for (const match of COMMENT_TEXT_MATCHES) {
      const data = await adminCommentsLoadAllInput.parseAsync({ offset: 0, limit: 20, match })
      expect(data.match).toBe(match)
    }
    await expect(adminCommentsLoadAllInput.parseAsync({ offset: 0, limit: 20, match: 'equals' })).rejects.toBeTruthy()
  })
})
