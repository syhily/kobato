import { describe, expect, it } from 'vitest'

import type { AdminCommentWire as AdminComment } from '@/shared/contracts/comments'
import type { CommentBody } from '@/shared/pt/comment-schema'
import type { AdminCommentsData, StatusCounts } from '@/ui/admin/comments/useCommentsController'

import {
  approveCommentInPages,
  removeCommentFromPages,
  updateCommentBodyInPages,
} from '@/ui/admin/comments/useCommentsController'

// Minimal Portable Text block — type-safe without constructing every span field.
const mockBody = [
  {
    _type: 'block' as const,
    _key: 'a',
    children: [{ _type: 'span' as const, _key: 'b', text: 'hello', marks: [] as never[] }],
  },
] satisfies CommentBody

// Minimal mock — the patches only touch a handful of fields so we
// don't need a full wire object. Cast through `as` avoids listing every
// nullable field from the DTO.
function mockComment(overrides: Partial<AdminComment> = {}): AdminComment {
  return {
    id: '1',
    createAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    deleteAt: null,
    body: mockBody,
    content: 'hello',
    type: 'post',
    ownerId: null,
    userId: '100',
    isVerified: false,
    rid: 0,
    isCollapsed: false,
    isPending: true,
    isPinned: false,
    voteUp: 0,
    voteDown: 0,
    rootId: null,
    name: 'Test User',
    emailVerified: false,
    link: null,
    badgeName: null,
    badgeColor: null,
    badgeTextColor: null,
    ua: null,
    ip: null,
    email: 'test@example.com',
    pageTitle: 'Test Page',
    pagePublicId: 'pid-1',
    pageCover: null,
    pagePermalink: '/test-page',
    ...overrides,
  }
}

const ZERO_COUNTS: StatusCounts = { all: 0, pending: 0, approved: 0, deleteRequested: 0 }

function makeData(comments: AdminComment[], statusCounts: StatusCounts = ZERO_COUNTS): AdminCommentsData {
  return {
    pages: [{ comments, total: comments.length, hasMore: false, statusCounts }],
    pageParams: [0],
  }
}

describe('approveCommentInPages', () => {
  it('sets isPending to false for the matching comment', () => {
    const comments = [mockComment({ id: '1', isPending: true }), mockComment({ id: '2', isPending: true })]
    const data = makeData(comments, { all: 2, pending: 2, approved: 0, deleteRequested: 0 })

    const next = approveCommentInPages(data, '1')
    expect(next.pages[0]!.comments[0]!.isPending).toBe(false)
    expect(next.pages[0]!.comments[1]!.isPending).toBe(true)
    expect(next.pages[0]!.statusCounts).toEqual({ all: 2, pending: 1, approved: 1, deleteRequested: 0 })
  })
})

describe('removeCommentFromPages', () => {
  it('removes the comment with the matching id', () => {
    const comments = [mockComment({ id: '1' }), mockComment({ id: '2' })]
    const data = makeData(comments, { all: 2, pending: 2, approved: 0, deleteRequested: 0 })

    const next = removeCommentFromPages(data, '1')
    expect(next.pages[0]!.comments).toHaveLength(1)
    expect(next.pages[0]!.comments[0]!.id).toBe('2')
  })

  it('still decrements the aggregate count when the id is not found', () => {
    // Mirrors the retired reducer action: `all` always steps down by one —
    // the caller only removes rows it just deleted server-side.
    const comments = [mockComment({ id: '1' })]
    const data = makeData(comments, { all: 1, pending: 1, approved: 0, deleteRequested: 0 })

    const next = removeCommentFromPages(data, '999')
    expect(next.pages[0]!.comments).toHaveLength(1)
    expect(next.pages[0]!.statusCounts.all).toBe(0)
  })

  it('decrements the bucket matching the removed comment state', () => {
    const comments = [mockComment({ id: '1', deleteRequestedAt: '2026-06-02T00:00:00.000Z' })]
    const data = makeData(comments, { all: 1, pending: 0, approved: 0, deleteRequested: 1 })

    const next = removeCommentFromPages(data, '1')
    expect(next.pages[0]!.statusCounts).toEqual({ all: 0, pending: 0, approved: 0, deleteRequested: 0 })
  })
})

describe('updateCommentBodyInPages', () => {
  it('updates the body of the matching comment', () => {
    const newBody = [
      {
        _type: 'block' as const,
        _key: 'x',
        children: [{ _type: 'span' as const, _key: 'y', text: 'updated', marks: [] as never[] }],
      },
    ] satisfies CommentBody
    const comments = [mockComment({ id: '1' }), mockComment({ id: '2' })]
    const data = makeData(comments)

    const next = updateCommentBodyInPages(data, '1', newBody)
    expect(next.pages[0]!.comments[0]!.body).toBe(newBody)
    expect(next.pages[0]!.comments[1]!.body).toBe(comments[1]!.body)
  })

  it('is a no-op when the id is not found', () => {
    const comments = [mockComment({ id: '1' })]
    const data = makeData(comments)

    const next = updateCommentBodyInPages(data, '999', mockBody)
    expect(next.pages[0]!.comments).toEqual(comments)
  })
})

describe('immutability', () => {
  it('does not mutate the previous pages on removeCommentFromPages', () => {
    const comments = [mockComment({ id: '1' })]
    const data = makeData(comments, { all: 1, pending: 1, approved: 0, deleteRequested: 0 })

    const next = removeCommentFromPages(data, '1')
    expect(next).not.toBe(data)
    expect(next.pages[0]).not.toBe(data.pages[0])
    expect(data.pages[0]!.comments).toHaveLength(1)
    expect(data.pages[0]!.statusCounts).toEqual({ all: 1, pending: 1, approved: 0, deleteRequested: 0 })
  })
})
