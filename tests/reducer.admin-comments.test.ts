import { describe, expect, it } from 'vitest'

import type { AdminCommentWire as AdminComment } from '@/shared/contracts/comments'
import type { CommentBody } from '@/shared/pt/comment-schema'
import type {
  ActiveFilter,
  CommentsAction,
  CommentsState,
  StatusCounts,
} from '@/ui/admin/comments/useCommentsController'

import { commentsReducer } from '@/ui/admin/comments/useCommentsController'

// Minimal Portable Text block — type-safe without constructing every span field.
const mockBody = [
  {
    _type: 'block' as const,
    _key: 'a',
    children: [{ _type: 'span' as const, _key: 'b', text: 'hello', marks: [] as never[] }],
  },
] satisfies CommentBody

// Minimal mock — the reducer only touches a handful of fields so we
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

function emptyState(overrides: Partial<CommentsState> = {}): CommentsState {
  return {
    comments: [],
    total: 0,
    filters: [],
    statusCounts: { all: 0, pending: 0, approved: 0 },
    ...overrides,
  }
}

const statusCounts: StatusCounts = { all: 100, pending: 20, approved: 80 }

describe('commentsReducer — loaded', () => {
  it('sets comments, total, and statusCounts from the payload', () => {
    const comments = [mockComment({ id: '1' }), mockComment({ id: '2' })]
    const action: CommentsAction = { type: 'loaded', comments, total: 100, statusCounts }
    const next = commentsReducer(emptyState(), action)

    expect(next.comments).toHaveLength(2)
    expect(next.total).toBe(100)
    expect(next.statusCounts).toEqual(statusCounts)
  })

  it('replaces existing comments (does not append)', () => {
    const prev = emptyState({ comments: [mockComment({ id: '1' })], total: 50 })
    const comments = [mockComment({ id: '2' })]
    const action: CommentsAction = { type: 'loaded', comments, total: 3, statusCounts }

    const next = commentsReducer(prev, action)
    expect(next.comments).toHaveLength(1)
    expect(next.comments[0]!.id).toBe('2')
    expect(next.total).toBe(3)
  })

  it('preserves filters when loading new data', () => {
    const filters: ActiveFilter[] = [{ field: 'status', value: 'pending', label: '待审核' }]
    const prev = emptyState({ filters })
    const action: CommentsAction = { type: 'loaded', comments: [], total: 0, statusCounts }

    const next = commentsReducer(prev, action)
    expect(next.filters).toEqual(filters)
  })
})

describe('commentsReducer — appended', () => {
  it('appends comments to the existing list', () => {
    const prev = emptyState({ comments: [mockComment({ id: '1' })], total: 50 })
    const action: CommentsAction = { type: 'appended', comments: [mockComment({ id: '2' })], total: 50 }

    const next = commentsReducer(prev, action)
    expect(next.comments).toHaveLength(2)
    expect(next.comments[0]!.id).toBe('1')
    expect(next.comments[1]!.id).toBe('2')
  })

  it('updates the total', () => {
    const prev = emptyState({ comments: [mockComment({ id: '1' })], total: 50 })
    const action: CommentsAction = { type: 'appended', comments: [], total: 100 }

    const next = commentsReducer(prev, action)
    expect(next.total).toBe(100)
  })

  it('preserves filters when appending', () => {
    const filters: ActiveFilter[] = [{ field: 'status', value: 'pending', label: '待审核' }]
    const prev = emptyState({ comments: [mockComment({ id: '1' })], total: 50, filters })
    const action: CommentsAction = { type: 'appended', comments: [], total: 50 }

    const next = commentsReducer(prev, action)
    expect(next.filters).toEqual(filters)
  })
})

describe('commentsReducer — addFilter', () => {
  it('adds a new filter when the field is not already present', () => {
    const prev = emptyState()
    const action: CommentsAction = { type: 'addFilter', field: 'status', value: 'pending', label: '待审核' }

    const next = commentsReducer(prev, action)
    expect(next.filters).toEqual([{ field: 'status', value: 'pending', label: '待审核' }])
  })

  it('replaces an existing filter for the same field (single chip per field)', () => {
    const prev = emptyState({
      filters: [{ field: 'status', value: 'pending', label: '待审核' }],
    })
    const action: CommentsAction = { type: 'addFilter', field: 'status', value: 'approved', label: '已审核' }

    const next = commentsReducer(prev, action)
    expect(next.filters).toHaveLength(1)
    expect(next.filters[0]!).toEqual({ field: 'status', value: 'approved', label: '已审核' })
  })

  it('keeps unrelated filters when replacing a same-field filter', () => {
    const prev = emptyState({
      filters: [
        { field: 'status', value: 'pending', label: '待审核' },
        { field: 'page', value: 'pid-1', label: 'pid-1' },
      ],
    })
    const action: CommentsAction = { type: 'addFilter', field: 'status', value: 'approved', label: '已审核' }

    const next = commentsReducer(prev, action)
    expect(next.filters).toHaveLength(2)
    expect(next.filters.find((f) => f.field === 'page')).toEqual({ field: 'page', value: 'pid-1', label: 'pid-1' })
    expect(next.filters.find((f) => f.field === 'status')).toEqual({
      field: 'status',
      value: 'approved',
      label: '已审核',
    })
  })
})

describe('commentsReducer — removeFilter', () => {
  it('removes the filter with the given field', () => {
    const prev = emptyState({
      filters: [
        { field: 'status', value: 'pending', label: '待审核' },
        { field: 'page', value: 'pid-1', label: 'pid-1' },
      ],
    })
    const action: CommentsAction = { type: 'removeFilter', field: 'status' }

    const next = commentsReducer(prev, action)
    expect(next.filters).toHaveLength(1)
    expect(next.filters[0]!.field).toBe('page')
  })

  it('is a no-op when the field is not in the filter list', () => {
    const prev = emptyState({ filters: [{ field: 'page', value: 'pid-1', label: 'pid-1' }] })
    const action: CommentsAction = { type: 'removeFilter', field: 'status' }

    const next = commentsReducer(prev, action)
    expect(next.filters).toHaveLength(1)
  })
})

describe('commentsReducer — renameFilter', () => {
  it('updates the label of an existing filter', () => {
    const prev = emptyState({
      filters: [
        { field: 'author', value: '42', label: '42' },
        { field: 'page', value: 'pid-1', label: 'pid-1' },
      ],
    })
    const action: CommentsAction = { type: 'renameFilter', field: 'author', label: 'Alice' }

    const next = commentsReducer(prev, action)
    expect(next.filters.find((f) => f.field === 'author')!.label).toBe('Alice')
    // Other filters unchanged
    expect(next.filters.find((f) => f.field === 'page')!.label).toBe('pid-1')
  })

  it('is a no-op when the field is not found', () => {
    const prev = emptyState()
    const action: CommentsAction = { type: 'renameFilter', field: 'author', label: 'Alice' }

    const next = commentsReducer(prev, action)
    expect(next).toEqual(prev)
  })
})

describe('commentsReducer — clearFilters', () => {
  it('removes all active filters', () => {
    const prev = emptyState({
      filters: [
        { field: 'status', value: 'pending', label: '待审核' },
        { field: 'page', value: 'pid-1', label: 'pid-1' },
        { field: 'author', value: '42', label: '42' },
      ],
    })
    const action: CommentsAction = { type: 'clearFilters' }

    const next = commentsReducer(prev, action)
    expect(next.filters).toEqual([])
  })

  it('preserves comments when clearing filters', () => {
    const comments = [mockComment({ id: '1' })]
    const prev = emptyState({ comments, filters: [{ field: 'status', value: 'pending', label: '待审核' }] })
    const action: CommentsAction = { type: 'clearFilters' }

    const next = commentsReducer(prev, action)
    expect(next.comments).toEqual(comments)
  })
})

describe('commentsReducer — approveComment', () => {
  it('sets isPending to false for the matching comment', () => {
    const comments = [mockComment({ id: '1', isPending: true }), mockComment({ id: '2', isPending: true })]
    const prev = emptyState({ comments })
    const action: CommentsAction = { type: 'approveComment', id: '1' }

    const next = commentsReducer(prev, action)
    expect(next.comments[0]!.isPending).toBe(false)
    expect(next.comments[1]!.isPending).toBe(true)
  })
})

describe('commentsReducer — removeComment', () => {
  it('removes the comment with the matching id', () => {
    const comments = [mockComment({ id: '1' }), mockComment({ id: '2' })]
    const prev = emptyState({ comments })
    const action: CommentsAction = { type: 'removeComment', id: '1' }

    const next = commentsReducer(prev, action)
    expect(next.comments).toHaveLength(1)
    expect(next.comments[0]!.id).toBe('2')
  })

  it('is a no-op when the id is not found', () => {
    const comments = [mockComment({ id: '1' })]
    const prev = emptyState({ comments })
    const action: CommentsAction = { type: 'removeComment', id: '999' }

    const next = commentsReducer(prev, action)
    expect(next.comments).toHaveLength(1)
  })
})

describe('commentsReducer — updateCommentContent', () => {
  it('updates the body of the matching comment', () => {
    const newBody = [
      {
        _type: 'block' as const,
        _key: 'x',
        children: [{ _type: 'span' as const, _key: 'y', text: 'updated', marks: [] as never[] }],
      },
    ] satisfies CommentBody
    const comments = [mockComment({ id: '1' }), mockComment({ id: '2' })]
    const prev = emptyState({ comments })
    const action: CommentsAction = { type: 'updateCommentContent', id: '1', body: newBody }

    const next = commentsReducer(prev, action)
    expect(next.comments[0]!.body).toBe(newBody)
    expect(next.comments[1]!.body).toBe(comments[1]!.body)
  })

  it('is a no-op when the id is not found', () => {
    const comments = [mockComment({ id: '1' })]
    const prev = emptyState({ comments })
    const action: CommentsAction = { type: 'updateCommentContent', id: '999', body: mockBody }

    const next = commentsReducer(prev, action)
    expect(next).toEqual(prev)
  })
})

describe('commentsReducer — immutability', () => {
  it('returns a new state object (does not mutate the previous state)', () => {
    const prev = emptyState()
    const action: CommentsAction = { type: 'loaded', comments: [mockComment()], total: 1, statusCounts }

    const next = commentsReducer(prev, action)
    expect(next).not.toBe(prev)
    expect(prev.comments).toHaveLength(0)
  })

  it('does not mutate the previous filters array on addFilter', () => {
    const filters: ActiveFilter[] = [{ field: 'status', value: 'pending', label: '待审核' }]
    const prev = emptyState({ filters })
    const action: CommentsAction = { type: 'addFilter', field: 'page', value: 'pid-1', label: 'pid-1' }

    const next = commentsReducer(prev, action)
    expect(next.filters).not.toBe(prev.filters)
    expect(prev.filters).toHaveLength(1)
  })

  it('does not mutate the previous comments array on appended', () => {
    const prev = emptyState({ comments: [mockComment({ id: '1' })] })
    const action: CommentsAction = { type: 'appended', comments: [mockComment({ id: '2' })], total: 2 }

    const next = commentsReducer(prev, action)
    expect(next.comments).not.toBe(prev.comments)
    expect(prev.comments).toHaveLength(1)
  })
})
