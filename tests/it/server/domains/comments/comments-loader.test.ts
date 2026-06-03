import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { seedMetric } from '#/_helpers/db'
import { adminSession, regularSession } from '#/_helpers/session'

// `loadComments` is the most-called server function on the site (every post
// view runs it). It coordinates 4 DB queries and 1 page upsert, with
// admin-vs-public visibility flipping which `pending` rows are visible. We
// pin the contract by mocking the DB query module — the real Drizzle calls
// are out of scope for this layer.

vi.mock('@/server/domains/comments/repos/public-query', () => ({
  pendingComments: vi.fn(),
  adminUserIds: vi.fn(),
  latestDistinctCommentIds: vi.fn(),
  commentsByIds: vi.fn(),
  countCommentsAndRoots: vi.fn(),
  findRootComments: vi.fn(),
  findChildComments: vi.fn(),
}))

vi.mock('@/server/infra/db/operations/metric', () => ({
  ensureMetric: vi.fn(async () => seedMetric()),
  findMetricByPublicId: vi.fn(),
  findMetricByTarget: vi.fn(),
}))

vi.mock('@/server/domains/analytics/repos/pv-batcher', () => ({
  bumpPageView: vi.fn(),
}))

vi.mock('@/server/domains/comments/services/email', () => ({
  sendApprovedComment: vi.fn(async () => undefined),
  sendNewComment: vi.fn(async () => undefined),
  sendNewReply: vi.fn(async () => undefined),
}))

// `loader.ts`'s sidebar-row → permalink projection reads
// `siteIdentity.website` via the blog-config bundle. Stub it so the
// public detail loader produces deterministic URLs.
vi.mock('@/shared/config/getters', () => ({
  requireBlogSettingsSection: (key: string) => {
    if (key === 'siteIdentity') {
      return { website: 'https://example.com', title: 'Yufan' }
    }
    if (key === 'sidebar') {
      return {
        sidebar: {
          widgets: [
            { type: 'search', enabled: true },
            { type: 'recentPosts', enabled: true, count: 5 },
            { type: 'recentComments', enabled: true, count: 5 },
            { type: 'randomTags', enabled: true, count: 20 },
            { type: 'todayCalendar', enabled: true },
          ],
        },
      }
    }
    if (key === 'comments') {
      return { comments: { size: 20 } }
    }
    return {}
  },
}))

const db = {} as NodePgDatabase

const queries = await import('@/server/domains/comments/repos/public-query')
const metricQueries = await import('@/server/infra/db/operations/metric')
const { loadComments, latestComments, pendingComments } =
  await import('@/server/domains/comments/services/public-query')

const POST_HELLO = { type: 'post' as const, ownerId: 1n }
const POST_NEW = { type: 'post' as const, ownerId: 2n }
const POST_PARALLEL = { type: 'post' as const, ownerId: 3n }

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 1n,
    createAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    deleteAt: null,
    content: 'x',
    body: [
      {
        _type: 'block' as const,
        _key: 'b1',
        style: 'normal' as const,
        children: [{ _type: 'span' as const, _key: 's1', text: 'x' }],
      },
    ],
    type: 'post' as const,
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
    name: 'Alice',
    email: 'a@example.com',
    emailVerified: true,
    link: '',
    badgeName: null,
    badgeColor: null,
    badgeTextColor: null,
    ...overrides,
  }
}

beforeEach(() => {
  for (const fn of Object.values({ ...queries, ...metricQueries })) {
    if (typeof fn === 'function' && 'mockReset' in fn) {
      ;(fn as ReturnType<typeof vi.fn>).mockReset()
    }
  }
})

describe('services/comments/loader — loadComments', () => {
  it('non-admins only see approved comments (pending=[false])', async () => {
    vi.mocked(queries.countCommentsAndRoots).mockResolvedValue({ total: 0, roots: 0 })
    vi.mocked(queries.findRootComments).mockResolvedValue([])
    vi.mocked(queries.findChildComments).mockResolvedValue([])
    vi.mocked(metricQueries.ensureMetric).mockResolvedValue(seedMetric())

    await loadComments(db, regularSession(), POST_HELLO, 0)

    expect(queries.countCommentsAndRoots).toHaveBeenCalledWith(db, POST_HELLO, [false], 2n)
    expect(queries.findRootComments).toHaveBeenCalledWith(db, POST_HELLO, [false], 0, expect.any(Number), 2n)
  })

  it('admins additionally see pending comments (pending=[false,true])', async () => {
    vi.mocked(queries.countCommentsAndRoots).mockResolvedValue({ total: 0, roots: 0 })
    vi.mocked(queries.findRootComments).mockResolvedValue([])
    vi.mocked(queries.findChildComments).mockResolvedValue([])
    vi.mocked(metricQueries.ensureMetric).mockResolvedValue(seedMetric())

    await loadComments(db, adminSession(), POST_HELLO, 0)

    expect(queries.countCommentsAndRoots).toHaveBeenCalledWith(db, POST_HELLO, [false, true], 1n)
    expect(queries.findRootComments).toHaveBeenCalledWith(db, POST_HELLO, [false, true], 0, expect.any(Number), 1n)
  })

  it('returns the union of root + child comments and the aggregated counts', async () => {
    vi.mocked(queries.countCommentsAndRoots).mockResolvedValue({ total: 5, roots: 2 })
    vi.mocked(queries.findRootComments).mockResolvedValue([row({ id: 1n }), row({ id: 2n })])
    vi.mocked(queries.findChildComments).mockResolvedValue([
      row({ id: 3n, rid: 1, rootId: 1n }),
      row({ id: 4n, rid: 1, rootId: 1n }),
      row({ id: 5n, rid: 2, rootId: 2n }),
    ])
    vi.mocked(metricQueries.ensureMetric).mockResolvedValue(seedMetric())

    const result = await loadComments(db, regularSession(), POST_HELLO, 0)

    expect(result?.count).toBe(5)
    expect(result?.roots_count).toBe(2)
    expect(result?.comments).toHaveLength(5)
    // Verify the join: child fetch was called with the root ids only.
    expect(queries.findChildComments).toHaveBeenCalledWith(db, POST_HELLO, [false], [1n, 2n], 2n)
  })

  it('upserts the metric even when the page has zero comments', async () => {
    vi.mocked(queries.countCommentsAndRoots).mockResolvedValue({ total: 0, roots: 0 })
    vi.mocked(queries.findRootComments).mockResolvedValue([])
    vi.mocked(queries.findChildComments).mockResolvedValue([])
    vi.mocked(metricQueries.ensureMetric).mockResolvedValue(seedMetric())

    await loadComments(db, regularSession(), POST_NEW, 0)

    expect(metricQueries.ensureMetric).toHaveBeenCalledWith(db, POST_NEW)
  })

  it('issues metric upsert + counts + root listing in parallel (single tick)', async () => {
    let inflight = 0
    let peak = 0
    function tracked<T>(value: T) {
      return new Promise<T>((resolve) => {
        inflight += 1
        peak = Math.max(peak, inflight)
        setTimeout(() => {
          inflight -= 1
          resolve(value)
        }, 20)
      })
    }
    vi.mocked(metricQueries.ensureMetric).mockImplementation(() => tracked(seedMetric()))
    vi.mocked(queries.countCommentsAndRoots).mockImplementation(() => tracked({ total: 0, roots: 0 }))
    vi.mocked(queries.findRootComments).mockImplementation(() => tracked([]))
    vi.mocked(queries.findChildComments).mockResolvedValue([])

    await loadComments(db, regularSession(), POST_PARALLEL, 0)

    expect(peak).toBe(3)
  })
})

describe('services/comments/loader — latestComments / pendingComments', () => {
  it('latestComments resolves authors and skips admins from the pool', async () => {
    vi.mocked(queries.adminUserIds).mockResolvedValue([99n])
    vi.mocked(queries.latestDistinctCommentIds).mockResolvedValue([10n, 20n])
    vi.mocked(queries.commentsByIds).mockResolvedValue([
      {
        id: 10n,
        type: 'post',
        ownerId: 1n,
        slug: 'a',
        title: 'A',
        author: 'Alice',
        authorLink: '',
      },
      {
        id: 20n,
        type: 'post',
        ownerId: 2n,
        slug: 'b',
        title: null,
        author: null,
        authorLink: null,
      },
    ])

    const list = await latestComments(db)

    expect(queries.adminUserIds).toHaveBeenCalledOnce()
    expect(queries.latestDistinctCommentIds).toHaveBeenCalledWith(db, [99n], expect.any(Number))
    expect(list).toHaveLength(2)
    expect(list[0].permalink).toBe('/posts/a/#user-comment-10')
    // Null author/title fall back to empty string (sidebar must never crash).
    expect(list[1].author).toBe('')
    expect(list[1].title).toBe('')
  })

  it('pendingComments forwards the configured sidebar size', async () => {
    vi.mocked(queries.pendingComments).mockResolvedValue([])
    await pendingComments(db)
    expect(queries.pendingComments).toHaveBeenCalledWith(db, expect.any(Number))
  })
})
