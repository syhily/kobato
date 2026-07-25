import { describe, expect, it } from 'vitest'

import type { CommentItemWire } from '@/shared/contracts/comments'

import { commentFlags, type CommentIdentity } from '@/ui/public/comments/comment-item/comment-flags'

function makeComment(overrides: Partial<CommentItemWire> = {}): CommentItemWire {
  return {
    id: '1',
    createAt: '2024-01-15T08:30:00.000Z',
    updatedAt: '2024-01-15T08:30:00.000Z',
    deleteAt: null,
    body: [],
    type: 'post',
    ownerId: '1',
    userId: '42',
    isVerified: true,
    rid: 0,
    isCollapsed: false,
    isPending: false,
    isPinned: false,
    voteUp: 0,
    voteDown: 0,
    rootId: null,
    name: 'Alice',
    emailVerified: true,
    link: null,
    badgeName: null,
    badgeColor: null,
    badgeTextColor: null,
    ...overrides,
  }
}

function makeIdentity(overrides: Partial<CommentIdentity> = {}): CommentIdentity {
  return {
    currentUserId: null,
    myComments: new Map(),
    ...overrides,
  }
}

describe('commentFlags', () => {
  it('flags token ownership and surfaces the edit-token expiry', () => {
    const flags = commentFlags(
      makeComment({ id: '7' }),
      makeIdentity({ myComments: new Map([['7', { expiresAt: 123 }]]) }),
    )
    expect(flags.isMine).toBe(true)
    expect(flags.myExpiresAt).toBe(123)
  })

  it('accepts an ownership entry without an expiry', () => {
    const flags = commentFlags(makeComment({ id: '7' }), makeIdentity({ myComments: new Map([['7', {}]]) }))
    expect(flags.isMine).toBe(true)
    expect(flags.myExpiresAt).toBeUndefined()
  })

  it('is not mine and carries no expiry when the map has no entry', () => {
    const flags = commentFlags(makeComment({ id: '7' }), makeIdentity())
    expect(flags.isMine).toBe(false)
    expect(flags.myExpiresAt).toBeUndefined()
  })

  it('flags session ownership when the comment userId matches the viewer', () => {
    const flags = commentFlags(makeComment({ userId: '42' }), makeIdentity({ currentUserId: '42' }))
    expect(flags.isOwnedByCurrentUser).toBe(true)
  })

  it('is not owned when the viewer is anonymous or a different user', () => {
    expect(commentFlags(makeComment({ userId: '42' }), makeIdentity()).isOwnedByCurrentUser).toBe(false)
    expect(commentFlags(makeComment({ userId: '42' }), makeIdentity({ currentUserId: '7' })).isOwnedByCurrentUser).toBe(
      false,
    )
  })

  it('flags a pending delete request', () => {
    const flags = commentFlags(makeComment({ deleteRequestedAt: '2024-06-01T00:00:00.000Z' }), makeIdentity())
    expect(flags.hasPendingDelete).toBe(true)
  })

  it('treats null and undefined deleteRequestedAt as no pending delete', () => {
    expect(commentFlags(makeComment({ deleteRequestedAt: null }), makeIdentity()).hasPendingDelete).toBe(false)
    expect(commentFlags(makeComment(), makeIdentity()).hasPendingDelete).toBe(false)
  })

  it('derives the full matrix independently per predicate', () => {
    // A token-owned comment by another session user with a pending delete:
    // all three predicates must hold at once, from one derivation.
    const flags = commentFlags(
      makeComment({ id: '9', userId: '42', deleteRequestedAt: '2024-06-01T00:00:00.000Z' }),
      makeIdentity({ currentUserId: '42', myComments: new Map([['9', { expiresAt: 55 }]]) }),
    )
    expect(flags).toEqual({
      isMine: true,
      isOwnedByCurrentUser: true,
      hasPendingDelete: true,
      myExpiresAt: 55,
    })
  })
})
