import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Mock } from 'vitest'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { CommentWithUser } from '@/server/domains/comments/repos/shared'

// `updateOwnComment` (visitor self-edit of their own comment) delegates
// the grace-window branch to the pure `decideOwnEdit` decider — see
// `tests/unit/server/domains/comments/services/policy.test.ts` for the
// timestamp matrix. This file pins what remains at the persistence
// seam:
//
//   * the decision drives WHICH optimistic-lock write runs
//     (`updateOwnCommentBody` vs `updateOwnCommentBodyAndPending`) and
//     whether the admin notification fires;
//   * a lost optimistic-lock race (0 rows affected) rejects CONFLICT;
//   * a row that vanishes mid-edit returns null without writing.

vi.mock('@/server/domains/comments/repos/public-query/by-id', () => ({
  findCommentWithUserById: vi.fn(),
}))
vi.mock('@/server/domains/comments/repos/admin-query', () => ({
  findCommentWithUserAndTarget: vi.fn(),
}))

vi.mock('@/server/domains/comments/repos/mutate', () => ({
  updateOwnCommentBody: vi.fn(async () => 1),
  updateOwnCommentBodyAndPending: vi.fn(async () => 1),
  updateCommentBodyAndContent: vi.fn(),
}))

vi.mock('@/server/domains/comments/repos/moderation', () => ({
  approveCommentById: vi.fn(),
  deleteCommentById: vi.fn(),
}))

vi.mock('@/server/infra/db/operations/metric', () => ({
  findMetricByPublicId: vi.fn(),
}))

vi.mock('@/server/domains/comments/services/email', () => ({
  sendApprovedComment: vi.fn(async () => undefined),
  sendNewComment: vi.fn(async () => undefined),
}))

// The canonicalize pipeline runs Shiki / KaTeX / Markdown
// projection — heavy, and orthogonal to the moderation-state branch
// we're testing. Stub it to a deterministic shape.
vi.mock('@/server/domains/comments/services/canonicalize', () => ({
  canonicalizeCommentBody: vi.fn(async (input: unknown) => ({
    body: input,
    content: 'edited markdown',
  })),
}))

const db = {} as NodePgDatabase

const queryRepo = await import('@/server/domains/comments/repos/public-query/by-id')
await import('@/server/domains/comments/repos/admin-query')
const mutateRepo = await import('@/server/domains/comments/repos/mutate')
const emails = await import('@/server/domains/comments/services/email')
const { updateOwnComment } = await import('@/server/domains/comments/services/moderate')

// `findCommentWithUserById` returns a deep Drizzle-inferred shape whose
// `body` union covers every PT block variant. The test rows are
// structurally compatible (single `'block'` paragraph) but TS doesn't
// widen the literal back into the union — a typed re-cast lets the
// fixture rows feed `mockResolvedValueOnce` without sprinkling extra
// casts at every call site.
const findCommentMock = queryRepo.findCommentWithUserById as unknown as Mock<
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

describe('updateOwnComment — decision wiring', () => {
  it('a silent-edit decision rewrites the body in place and skips the admin email', async () => {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000)
    const existing = row({ createAt: tenMinutesAgo, isPending: false })
    findCommentMock.mockResolvedValueOnce(existing).mockResolvedValueOnce(existing)

    const result = await updateOwnComment(db, '42', NEW_BODY)

    expect(mutateRepo.updateOwnCommentBody).toHaveBeenCalledTimes(1)
    expect(mutateRepo.updateOwnCommentBody).toHaveBeenCalledWith(
      db,
      42n,
      NEW_BODY,
      'edited markdown',
      existing.updatedAt,
    )
    expect(mutateRepo.updateOwnCommentBodyAndPending).not.toHaveBeenCalled()
    expect(emails.sendNewComment).not.toHaveBeenCalled()
    expect(result).not.toBeNull()
    expect(result?.isPending).toBe(false)
  })

  it('a re-pend decision re-queues the comment and notifies the admin', async () => {
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000)
    const existing = row({ createAt: hourAgo, isPending: false })
    const refetched = row({ createAt: hourAgo, isPending: true })
    findCommentMock.mockResolvedValueOnce(existing).mockResolvedValueOnce(refetched)

    const result = await updateOwnComment(db, '42', NEW_BODY)

    expect(mutateRepo.updateOwnCommentBodyAndPending).toHaveBeenCalledTimes(1)
    expect(mutateRepo.updateOwnCommentBodyAndPending).toHaveBeenCalledWith(
      db,
      42n,
      NEW_BODY,
      'edited markdown',
      existing.updatedAt,
    )
    expect(mutateRepo.updateOwnCommentBody).not.toHaveBeenCalled()
    expect(emails.sendNewComment).toHaveBeenCalledTimes(1)
    // The notification carries the refetched (now-pending) row + its
    // (type, ownerId) target so the moderation inbox links back to
    // the correct post / page.
    const [, commentArg, targetArg] = vi.mocked(emails.sendNewComment).mock.calls[0]
    expect(commentArg.isPending).toBe(true)
    expect(targetArg).toEqual({ type: 'post', ownerId: 1n })
    expect(result?.isPending).toBe(true)
  })
})

describe('updateOwnComment — persistence edges', () => {
  it('throws CONFLICT when the optimistic lock loses the race', async () => {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000)
    const existing = row({ createAt: tenMinutesAgo })
    findCommentMock.mockResolvedValueOnce(existing)
    vi.mocked(mutateRepo.updateOwnCommentBody).mockResolvedValueOnce(0)

    await expect(updateOwnComment(db, '42', NEW_BODY)).rejects.toThrow(/评论已被修改/)

    // A rejected write must not trigger the refetch or the admin email.
    expect(findCommentMock).toHaveBeenCalledTimes(1)
    expect(emails.sendNewComment).not.toHaveBeenCalled()
  })

  it('returns null and skips writes when the row vanished mid-edit', async () => {
    findCommentMock.mockResolvedValueOnce(null)

    const result = await updateOwnComment(db, '42', NEW_BODY)

    expect(result).toBeNull()
    expect(mutateRepo.updateOwnCommentBody).not.toHaveBeenCalled()
    expect(mutateRepo.updateOwnCommentBodyAndPending).not.toHaveBeenCalled()
    expect(emails.sendNewComment).not.toHaveBeenCalled()
  })
})
