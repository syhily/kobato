import type { Mock } from 'vite-plus/test'

import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import type { CommentWithUser } from '@/server/infra/db/operations/comment'

// `updateOwnComment` (visitor self-edit of their own comment) branches
// on the age of the row at edit time:
//
//   * Inside the 30-minute grace window from `createdAt` — keep
//     whatever moderation state the row is already in, do NOT bump
//     `is_pending`, and do NOT notify the admin. The commenter is
//     polishing a just-posted reply; nothing reviewer-facing changed.
//   * Outside the window — re-pend (`is_pending = true`,
//     `updatedAt = now()`) and fire `sendNewComment` so the moderation
//     inbox sees the edit.
//
// Both paths share the same DB-read → canonicalize → DB-write →
// refetch → projection pipeline; the only differences are the SQL
// helper picked and whether the email fires.

vi.mock('@/server/infra/db/operations/comment', () => ({
  findCommentWithUserById: vi.fn(),
  updateOwnCommentBody: vi.fn(async () => undefined),
  updateOwnCommentBodyAndPending: vi.fn(async () => undefined),
  // Touched only by sibling helpers in `comments/admin` we don't
  // exercise here, but the module imports them so the mock has to
  // cover the full surface.
  approveCommentById: vi.fn(),
  countAllComments: vi.fn(),
  deleteCommentById: vi.fn(),
  findCommentWithUserAndTarget: vi.fn(),
  listAdminComments: vi.fn(),
  searchCommentAuthors: vi.fn(),
  searchPages: vi.fn(),
  updateCommentBodyAndContent: vi.fn(),
}))

vi.mock('@/server/infra/db/operations/metric', () => ({
  findMetricByPublicId: vi.fn(),
}))

vi.mock('@/server/domains/comments/email', () => ({
  sendApprovedComment: vi.fn(async () => undefined),
  sendNewComment: vi.fn(async () => undefined),
}))

// The canonicalize pipeline runs Shiki / KaTeX / Mermaid / Markdown
// projection — heavy, and orthogonal to the moderation-state branch
// we're testing. Stub it to a deterministic shape.
vi.mock('@/server/domains/comments/canonicalize', () => ({
  canonicalizeCommentBody: vi.fn(async (input: unknown) => ({ body: input, content: 'edited markdown' })),
}))

const queries = await import('@/server/infra/db/operations/comment')
const emails = await import('@/server/domains/comments/email')
const { updateOwnComment } = await import('@/server/domains/comments/services/moderate')

// `findCommentWithUserById` returns a deep Drizzle-inferred shape whose
// `body` union covers every PT block variant. The test rows are
// structurally compatible (single `'block'` paragraph) but TS doesn't
// widen the literal back into the union — a typed re-cast lets the
// fixture rows feed `mockResolvedValueOnce` without sprinkling extra
// casts at every call site.
const findCommentMock = queries.findCommentWithUserById as unknown as Mock<
  (id: bigint) => Promise<CommentWithUser | null>
>

function row(overrides: Partial<CommentWithUser> = {}): CommentWithUser {
  return {
    id: 42n,
    createAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    deleteAt: null,
    content: 'old markdown',
    body: [
      {
        _type: 'block',
        _key: 'b1',
        style: 'normal',
        children: [{ _type: 'span', _key: 's1', text: 'old' }],
      },
    ],
    type: 'post',
    ownerId: 1n,
    userId: 7n,
    isVerified: true,
    ua: '',
    ip: '',
    rid: 0,
    isCollapsed: false,
    isPending: false,
    isPinned: false,
    voteUp: 0,
    voteDown: 0,
    rootId: 0n,
    deleteRequestedAt: null,
    deleteRequestedBy: null,
    name: 'reader',
    email: 'reader@example.com',
    emailVerified: null,
    link: null,
    badgeName: null,
    badgeColor: null,
    badgeTextColor: null,
    ...overrides,
  } as CommentWithUser
}

const NEW_BODY = [
  {
    _type: 'block' as const,
    _key: 'b2',
    style: 'normal' as const,
    children: [{ _type: 'span' as const, _key: 's2', text: 'edited' }],
  },
]

beforeEach(() => {
  vi.clearAllMocks()
})

describe('updateOwnComment — grace-window branch', () => {
  it('edit within 30 minutes keeps approved state and stays silent', async () => {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000)
    const existing = row({ createAt: tenMinutesAgo, isPending: false })
    findCommentMock.mockResolvedValueOnce(existing).mockResolvedValueOnce(existing)

    const result = await updateOwnComment('42', NEW_BODY)

    expect(queries.updateOwnCommentBody).toHaveBeenCalledTimes(1)
    expect(queries.updateOwnCommentBody).toHaveBeenCalledWith(42n, NEW_BODY, 'edited markdown')
    expect(queries.updateOwnCommentBodyAndPending).not.toHaveBeenCalled()
    expect(emails.sendNewComment).not.toHaveBeenCalled()
    expect(result).not.toBeNull()
    expect(result?.isPending).toBe(false)
  })

  it('edit older than 30 minutes re-pends and notifies admin', async () => {
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000)
    const existing = row({ createAt: hourAgo, isPending: false })
    const refetched = row({ createAt: hourAgo, isPending: true })
    findCommentMock.mockResolvedValueOnce(existing).mockResolvedValueOnce(refetched)

    const result = await updateOwnComment('42', NEW_BODY)

    expect(queries.updateOwnCommentBodyAndPending).toHaveBeenCalledTimes(1)
    expect(queries.updateOwnCommentBodyAndPending).toHaveBeenCalledWith(42n, NEW_BODY, 'edited markdown')
    expect(queries.updateOwnCommentBody).not.toHaveBeenCalled()
    expect(emails.sendNewComment).toHaveBeenCalledTimes(1)
    // The notification carries the refetched (now-pending) row + its
    // (type, ownerId) target so the moderation inbox links back to
    // the correct post / page.
    const [commentArg, targetArg] = vi.mocked(emails.sendNewComment).mock.calls[0]
    expect(commentArg.isPending).toBe(true)
    expect(targetArg).toEqual({ type: 'post', ownerId: 1n })
    expect(result?.isPending).toBe(true)
  })

  it('returns null and skips writes when the row vanished mid-edit', async () => {
    findCommentMock.mockResolvedValueOnce(null)

    const result = await updateOwnComment('42', NEW_BODY)

    expect(result).toBeNull()
    expect(queries.updateOwnCommentBody).not.toHaveBeenCalled()
    expect(queries.updateOwnCommentBodyAndPending).not.toHaveBeenCalled()
    expect(emails.sendNewComment).not.toHaveBeenCalled()
  })
})
