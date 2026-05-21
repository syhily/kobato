import { describe, expect, it } from 'vite-plus/test'

import { commentReplySchema } from '@/server/domains/comments/schema'

const HELLO_BODY = [
  {
    _type: 'block' as const,
    _key: 'b1',
    style: 'normal' as const,
    children: [{ _type: 'span' as const, _key: 's1', text: 'Thoughtful comment.' }],
  },
]

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

  it('rejects a body that violates the PT comment dialect', async () => {
    // Headings are rejected because the comment dialect only allows
    // `normal` and `blockquote` text-block styles. Validation
    // surfaces the field path under `body[*]`, so we just assert the
    // schema throws — the precise issue path varies by Zod version.
    const badBody = [
      {
        _type: 'block',
        _key: 'b1',
        style: 'h2',
        children: [{ _type: 'span', _key: 's1', text: 'Heading' }],
      },
    ]
    await expect(commentReplySchema.parseAsync({ ...base, body: badBody })).rejects.toBeTruthy()
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
