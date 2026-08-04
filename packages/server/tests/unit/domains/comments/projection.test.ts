import type { CommentAndUser, CommentItem } from '@kobato/shared/types/comments'

import { asAdminCommentsWire, asCommentItemsWire, asCommentItemWire } from '@kobato/server/domains/comments/projection'
import { EMPTY_LEXICAL_COMMENT_BODY } from '@kobato/shared/lexical/comment-schema'
import { describe, expect, it } from 'vitest'

// The wire helpers bridge `CommentAndUser` (Drizzle row shape: number
// ids, Date timestamps) onto the contract DTO (`CommentItemWire`:
// string ids, ISO timestamps). Without this projection, the response
// runtime validator in the adapter rejects every comment-listing
// response — see the original "expected string, received bigint"
// regression report.

function makeRow(overrides: Partial<CommentAndUser> = {}): CommentAndUser {
  return {
    id: 7,
    createAt: new Date('2024-01-15T08:30:00.000Z'),
    updatedAt: new Date('2024-01-16T08:30:00.000Z'),
    deleteAt: null,
    body: EMPTY_LEXICAL_COMMENT_BODY,
    content: null,
    type: 'post',
    ownerId: 42,
    userId: 9,
    isVerified: true,
    ua: null,
    ip: null,
    rid: 0,
    isCollapsed: false,
    isPending: false,
    isPinned: false,
    voteUp: 0,
    voteDown: 0,
    rootId: null,
    name: 'Alice',
    email: 'alice@example.com',
    emailVerified: true,
    link: null,
    badgeName: null,
    badgeColor: null,
    badgeTextColor: null,
    ...overrides,
  }
}

describe('asCommentItemWire', () => {
  it('converts bigint ids to decimal strings', () => {
    const wire = asCommentItemWire(makeRow())
    expect(wire.id).toBe('7')
    expect(wire.ownerId).toBe('42')
    expect(wire.userId).toBe('9')
  })

  it('strips PII fields (ua, ip, email) from public wire', () => {
    const wire = asCommentItemWire(makeRow())
    expect(wire).not.toHaveProperty('ua')
    expect(wire).not.toHaveProperty('ip')
    expect(wire).not.toHaveProperty('email')
  })

  it('emits ISO-8601 timestamps for Date fields', () => {
    const wire = asCommentItemWire(makeRow())
    expect(wire.createAt).toBe('2024-01-15T08:30:00.000Z')
    expect(wire.updatedAt).toBe('2024-01-16T08:30:00.000Z')
    expect(wire.deleteAt).toBeNull()
  })

  it('preserves null ownerId / rootId rather than coercing to "null"', () => {
    const wire = asCommentItemWire(makeRow({ ownerId: null, rootId: null }))
    expect(wire.ownerId).toBeNull()
    expect(wire.rootId).toBeNull()
  })

  it('recurses into the children tree', () => {
    const child: CommentItem = { ...makeRow({ id: 8, rid: 7 }), children: [] }
    const root: CommentItem = { ...makeRow({ id: 7 }), children: [child] }
    const wire = asCommentItemWire(root)
    expect(wire.children?.[0]?.id).toBe('8')
    expect(typeof wire.children?.[0]?.id).toBe('string')
  })

  it('idempotent against pre-converted string input', () => {
    const pre = makeRow({ id: '7' as unknown as number })
    const wire = asCommentItemWire(pre)
    expect(wire.id).toBe('7')
  })

  it('passes the thread-cap markers through when present', () => {
    const root: CommentItem = { ...makeRow({ id: 7 }), children: [], childrenTruncated: true, childrenTotal: 142 }
    const wire = asCommentItemWire(root)
    expect(wire.childrenTruncated).toBe(true)
    expect(wire.childrenTotal).toBe(142)
  })

  it('omits the thread-cap markers on untruncated roots', () => {
    const wire = asCommentItemWire(makeRow())
    expect(wire).not.toHaveProperty('childrenTruncated')
    expect(wire).not.toHaveProperty('childrenTotal')
  })
})

describe('asCommentItemsWire', () => {
  it('maps an array of rows through the projection', () => {
    const wire = asCommentItemsWire([makeRow({ id: 1 }), makeRow({ id: 2 })])
    expect(wire.map((c) => c.id)).toEqual(['1', '2'])
  })
})

describe('asAdminCommentsWire', () => {
  it('adds pageTitle / pagePublicId on top of the base projection', () => {
    const wire = asAdminCommentsWire([
      {
        ...makeRow({ id: 3 }),
        pageTitle: '我的页面',
        pagePublicId: 'public-uuid',
        pageCover: null,
        pagePermalink: null,
      },
    ])
    expect(wire[0]?.pageTitle).toBe('我的页面')
    expect(wire[0]?.pagePublicId).toBe('public-uuid')
  })

  it('preserves PII fields (ua, ip, email) on admin wire', () => {
    const wire = asAdminCommentsWire([
      { ...makeRow({ id: 3 }), pageTitle: null, pagePublicId: null, pageCover: null, pagePermalink: null },
    ])
    expect(wire[0]?.ua).toBeNull()
    expect(wire[0]?.ip).toBeNull()
    expect(wire[0]?.email).toBe('alice@example.com')
  })
})
