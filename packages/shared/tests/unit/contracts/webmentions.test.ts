import { publicWebmentionDto } from '@kobato/shared/contracts/webmentions'
import { describe, expect, it } from 'vitest'

// The public DTO is the wire contract of the「引用与回应」block: it must
// carry display fields only — internal moderation state (status,
// targetOwnerId, rawPayload, moderatedAt) never crosses the boundary.
describe('contracts / publicWebmentionDto', () => {
  it('pins exactly the seven public fields, stripping everything internal', () => {
    const parsed = publicWebmentionDto.parse({
      id: '7',
      sourceUrl: 'https://sender.example/post',
      type: 'reply',
      authorName: 'Jane Doe',
      title: 'A mention',
      summary: 'A summary',
      createdAt: '2026-08-01T00:00:00.000Z',
      // Internal fields that must NOT survive the projection.
      status: 'approved',
      targetUrl: 'https://example.com/posts/wm-target/',
      targetType: 'post',
      targetOwnerId: 42,
      rawPayload: { source: 'https://sender.example/post', target: 'https://example.com/posts/wm-target/' },
      fetchedAt: '2026-08-01T00:00:00.000Z',
      moderatedAt: '2026-08-01T12:00:00.000Z',
    })
    expect(Object.keys(parsed).sort()).toEqual(
      ['authorName', 'createdAt', 'id', 'sourceUrl', 'summary', 'title', 'type'].sort(),
    )
  })
})
