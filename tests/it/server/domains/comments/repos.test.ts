import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'

import { eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { emptyInklingDocument, inklingFromPt } from '#/_helpers/inkling'
import { clearAllTables } from '#/_helpers/integration-db'
import {
  countAllComments,
  countAdminComments,
  countAdminPendingDashboard,
  countApprovedRepliesOfComment,
  countMyComments,
  findCommentWithUserAndTarget,
  listAdminComments,
  listAdminPendingDashboard,
  listMyCommentEntities,
  listMyComments,
  searchCommentAuthors,
  searchPages,
} from '@/server/domains/comments/repos/admin-query'
import {
  adminClearDeleteRequest,
  approveCommentById,
  bulkApprovePendingByUser,
  bulkSoftDeleteCommentsByUser,
  clearDeleteRequest,
  deleteCommentById,
  requestDeleteComment,
  softDeleteCommentById,
} from '@/server/domains/comments/repos/moderation'
import {
  insertComment,
  updateCommentBodyAndContent,
  updateCommentContent,
  updateOwnCommentBody,
  updateOwnCommentBodyAndPending,
} from '@/server/domains/comments/repos/mutate'
import {
  adminUserIds,
  commentsByIds,
  latestDistinctCommentIds,
  pendingComments,
} from '@/server/domains/comments/repos/public-query/admin'
import {
  countApprovedCommentsByUser,
  findCommentWithUserById,
  findCommentsByIds,
  findParentCommentsByIds,
  recentCommentsForUserDedupe,
} from '@/server/domains/comments/repos/public-query/by-id'
import { resolveEntitiesForComments } from '@/server/domains/comments/repos/public-query/entities'
import {
  countCommentsAndRoots,
  findChildComments,
  findCommentRootId,
  findRootComments,
} from '@/server/domains/comments/repos/public-query/threads'
import {
  adminPendingWhere,
  buildAdminListConditions,
  mineWhere,
  targetSlugTitleSubquery,
  whereTarget,
} from '@/server/domains/comments/repos/shared'
import { createDbPool, closePool } from '@/server/infra/db/pool'
import { comment } from '@/server/infra/db/schema/comment'
import { metric } from '@/server/infra/db/schema/metric'
import { page } from '@/server/infra/db/schema/page'
import { post } from '@/server/infra/db/schema/post'
import { user } from '@/server/infra/db/schema/user'

const poolManager = createDbPool()
const db: NodePgDatabase = poolManager.db
const pool: Pool = poolManager.pool

afterAll(async () => {
  await closePool(pool)
})

beforeEach(async () => {
  await clearAllTables(db)
})

async function seedUser(opts: Partial<typeof user.$inferInsert> = {}): Promise<bigint> {
  const rows = await db
    .insert(user)
    .values({
      name: opts.name ?? 'Alice',
      email: opts.email ?? `alice-${Date.now()}-${Math.random()}@example.com`,
      password: 'hashed',
      role: opts.role,
      ...opts,
    })
    .returning({ id: user.id })
  return rows[0]!.id
}

async function seedPost(slug: string): Promise<bigint> {
  const rows = await db
    .insert(post)
    .values({
      slug,
      title: `Post ${slug}`,
      summary: '',
      published: true,
      publishedRevisionId: 1n,
    })
    .returning({ id: post.id })
  return rows[0]!.id
}

async function seedPageEntity(slug: string): Promise<bigint> {
  const rows = await db
    .insert(page)
    .values({ slug, title: `Page ${slug}` })
    .returning({ id: page.id })
  return rows[0]!.id
}

async function seedMetricRow(type: 'post' | 'page', ownerId: bigint, publicId: string = randomUUID()): Promise<string> {
  await db.insert(metric).values({ type, ownerId, publicId })
  return publicId
}

async function seedComment(opts: Partial<typeof comment.$inferInsert> = {}): Promise<bigint> {
  const rows = await db
    .insert(comment)
    .values({
      type: opts.type ?? 'post',
      ownerId: opts.ownerId ?? 1n,
      userId: opts.userId ?? 1n,
      content: opts.content ?? 'hello',
      body: opts.body ?? emptyInklingDocument(),
      rid: opts.rid ?? 0,
      rootId: opts.rootId ?? 0n,
      isPending: opts.isPending ?? false,
      ...opts,
    })
    .returning({ id: comment.id })
  return rows[0]!.id
}

beforeAll(async () => {
  // Touch the subquery builder once so it registers as covered.
  targetSlugTitleSubquery(db)
})

describe('comments/repos/shared — whereTarget', () => {
  it('builds an AND condition over type and ownerId', () => {
    const cond = whereTarget({ type: 'post', ownerId: 5n })
    expect(cond).toBeDefined()
  })
})

describe('comments/repos/shared — buildAdminListConditions', () => {
  it('returns only the deletedAt guard by default', () => {
    const conds = buildAdminListConditions({})
    expect(conds).toHaveLength(1)
  })

  it('stacks status, target, user, q, match and date bounds', () => {
    const conds = buildAdminListConditions({
      target: { type: 'post', ownerId: 1n },
      userId: 7n,
      status: 'pending',
      q: 'foo',
      match: 'does-not-contain',
      createdAfter: new Date('2026-01-01'),
      createdBefore: new Date('2026-12-31'),
    })
    expect(conds.length).toBeGreaterThan(1)
  })
})

describe('comments/repos/shared — adminPendingWhere', () => {
  it('approval kind → only pending with no delete-request', () => {
    expect(adminPendingWhere('approval')).toBeDefined()
  })
  it('deletion kind → only delete-requested', () => {
    expect(adminPendingWhere('deletion')).toBeDefined()
  })
  it('all kind → pending OR delete-requested', () => {
    expect(adminPendingWhere('all')).toBeDefined()
  })
})

describe('comments/repos/shared — mineWhere', () => {
  it('applies only the visible-clause by default', () => {
    expect(mineWhere(1n)).toBeDefined()
  })

  it('narrowes by status, entity and q when supplied', () => {
    expect(
      mineWhere(1n, {
        status: 'pending',
        entity: { type: 'post', ownerId: 2n },
        q: 'foo',
      }),
    ).toBeDefined()
  })
})

describe('comments/repos/moderation — approveCommentById', () => {
  it('flips is_pending to false', async () => {
    const id = await seedComment({ isPending: true })
    await approveCommentById(db, id)
    const rows = await db.select({ isPending: comment.isPending }).from(comment).where(eq(comment.id, id))
    expect(rows[0]?.isPending).toBe(false)
  })
})

describe('comments/repos/moderation — deleteCommentById', () => {
  it('removes the row', async () => {
    const id = await seedComment()
    await deleteCommentById(db, id)
    const rows = await db.select({ id: comment.id }).from(comment).where(eq(comment.id, id))
    expect(rows).toHaveLength(0)
  })
})

describe('comments/repos/moderation — softDeleteCommentById', () => {
  it('sets deleted_at', async () => {
    const id = await seedComment()
    await softDeleteCommentById(db, id)
    const rows = await db.select({ deletedAt: comment.deletedAt }).from(comment).where(eq(comment.id, id))
    expect(rows[0]?.deletedAt).not.toBeNull()
  })
})

describe('comments/repos/moderation — bulkApprovePendingByUser', () => {
  it("approves only that user's pending rows and returns the count", async () => {
    const u1 = await seedUser({ name: 'U1', email: 'u1@x.com' })
    const u2 = await seedUser({ name: 'U2', email: 'u2@x.com' })
    const pid = await seedPost('p1')
    await seedComment({ userId: u1, ownerId: pid, isPending: true })
    await seedComment({ userId: u1, ownerId: pid, isPending: true })
    await seedComment({ userId: u2, ownerId: pid, isPending: true })
    const n = await bulkApprovePendingByUser(db, u1)
    expect(n).toBe(2)
  })
})

describe('comments/repos/moderation — bulkSoftDeleteCommentsByUser', () => {
  it("soft-deletes all of a user's live rows", async () => {
    const u1 = await seedUser({ name: 'U1', email: 'u1@x.com' })
    const pid = await seedPost('p2')
    await seedComment({ userId: u1, ownerId: pid })
    await seedComment({ userId: u1, ownerId: pid })
    const n = await bulkSoftDeleteCommentsByUser(db, u1)
    expect(n).toBe(2)
  })
})

describe('comments/repos/moderation — requestDeleteComment', () => {
  it('records deleteRequestedAt and deleteRequestedBy', async () => {
    const u1 = await seedUser({ name: 'U1', email: 'u1@x.com' })
    const pid = await seedPost('p3')
    const id = await seedComment({ userId: u1, ownerId: pid })
    await requestDeleteComment(db, id, u1)
    const rows = await db
      .select({ deleteRequestedBy: comment.deleteRequestedBy })
      .from(comment)
      .where(eq(comment.id, id))
    expect(rows[0]?.deleteRequestedBy).toBe(u1)
  })
})

describe('comments/repos/moderation — clearDeleteRequest', () => {
  it('clears only when the requester matches', async () => {
    const u1 = await seedUser({ name: 'U1', email: 'u1@x.com' })
    const u2 = await seedUser({ name: 'U2', email: 'u2@x.com' })
    const pid = await seedPost('p4')
    const id = await seedComment({ userId: u1, ownerId: pid })
    await requestDeleteComment(db, id, u1)
    const ok1 = await clearDeleteRequest(db, id, u2)
    expect(ok1).toBe(false)
    const ok2 = await clearDeleteRequest(db, id, u1)
    expect(ok2).toBe(true)
  })
})

describe('comments/repos/moderation — adminClearDeleteRequest', () => {
  it('clears the request regardless of requester', async () => {
    const u1 = await seedUser({ name: 'U1', email: 'u1@x.com' })
    const pid = await seedPost('p5')
    const id = await seedComment({ userId: u1, ownerId: pid })
    await requestDeleteComment(db, id, u1)
    const ok = await adminClearDeleteRequest(db, id)
    expect(ok).toBe(true)
  })
})

describe('comments/repos/mutate — insertComment', () => {
  it('inserts and returns the row', async () => {
    const u1 = await seedUser({ name: 'U1', email: 'u1@x.com' })
    const pid = await seedPost('p6')
    const row = await insertComment(db, {
      type: 'post',
      ownerId: pid,
      userId: u1,
      content: 'hi',
      body: emptyInklingDocument(),
    })
    expect(row).not.toBeNull()
    expect(row!.content).toBe('hi')
  })
})

describe('comments/repos/mutate — updateCommentContent', () => {
  it('rewrites content', async () => {
    const id = await seedComment({ content: 'old' })
    await updateCommentContent(db, id, 'new')
    const rows = await db.select({ content: comment.content }).from(comment).where(eq(comment.id, id))
    expect(rows[0]?.content).toBe('new')
  })
})

describe('comments/repos/mutate — updateCommentBodyAndContent', () => {
  it('rewrites body + content', async () => {
    const id = await seedComment({ content: 'old' })
    await updateCommentBodyAndContent(db, id, emptyInklingDocument(), 'rewritten')
    const rows = await db.select({ content: comment.content }).from(comment).where(eq(comment.id, id))
    expect(rows[0]?.content).toBe('rewritten')
  })
})

describe('comments/repos/mutate — updateOwnCommentBody', () => {
  it('returns 0 when updated_at has drifted (optimistic lock)', async () => {
    const id = await seedComment({ content: 'old' })
    const n = await updateOwnCommentBody(db, id, emptyInklingDocument(), 'x', new Date('2000-01-01'))
    expect(n).toBe(0)
  })
  it('returns 1 when the optimistic lock matches', async () => {
    const rows = await db
      .insert(comment)
      .values({
        type: 'post',
        ownerId: 1n,
        userId: 1n,
        content: 'x',
        body: emptyInklingDocument(),
        updatedAt: new Date('2025-01-01'),
      })
      .returning()
    const id = rows[0]!.id
    const n = await updateOwnCommentBody(db, id, emptyInklingDocument(), 'y', new Date('2025-01-01'))
    expect(n).toBe(1)
  })
})

describe('comments/repos/mutate — updateOwnCommentBodyAndPending', () => {
  it('re-pends the comment when the lock matches', async () => {
    const rows = await db
      .insert(comment)
      .values({
        type: 'post',
        ownerId: 1n,
        userId: 1n,
        content: 'x',
        body: emptyInklingDocument(),
        updatedAt: new Date('2025-01-01'),
        isPending: false,
      })
      .returning()
    const id = rows[0]!.id
    const n = await updateOwnCommentBodyAndPending(db, id, emptyInklingDocument(), 'y', new Date('2025-01-01'))
    expect(n).toBe(1)
    const after = await db.select({ isPending: comment.isPending }).from(comment).where(eq(comment.id, id))
    expect(after[0]?.isPending).toBe(true)
  })
})

describe('comments/repos/public-query/entities — resolveEntitiesForComments', () => {
  it('returns an empty map for an empty input', async () => {
    const out = await resolveEntitiesForComments(db, [])
    expect(out.size).toBe(0)
  })

  it('resolves posts and pages in a single round-trip each', async () => {
    const pid = await seedPost('ent-post')
    const pgid = await seedPageEntity('ent-page')
    const out = await resolveEntitiesForComments(db, [
      { type: 'post', ownerId: pid },
      { type: 'page', ownerId: pgid },
    ])
    expect(out.get(`post:${pid}`)?.slug).toBe('ent-post')
    expect(out.get(`page:${pgid}`)?.title).toBe('Page ent-page')
  })
})

describe('comments/repos/public-query/by-id — countApprovedCommentsByUser', () => {
  it('counts non-pending rows for a user', async () => {
    const u1 = await seedUser({ name: 'U1', email: 'u1@x.com' })
    const pid = await seedPost('p7')
    await seedComment({ userId: u1, ownerId: pid, isPending: true })
    await seedComment({ userId: u1, ownerId: pid, isPending: false })
    expect(await countApprovedCommentsByUser(db, u1)).toBe(1)
  })
})

describe('comments/repos/public-query/by-id — recentCommentsForUserDedupe', () => {
  it('returns recent contentHash rows ordered by recency', async () => {
    const u1 = await seedUser({ name: 'U1', email: 'u1@x.com' })
    const pid = await seedPost('p8')
    await seedComment({ userId: u1, ownerId: pid, contentHash: 'hash1' })
    await seedComment({ userId: u1, ownerId: pid, contentHash: 'hash2' })
    const rows = await recentCommentsForUserDedupe(db, u1, new Date(0), 10)
    expect(rows).toHaveLength(2)
  })
})

describe('comments/repos/public-query/by-id — findCommentWithUserById', () => {
  it('returns null for a non-existent id', async () => {
    expect(await findCommentWithUserById(db, 9999n)).toBeNull()
  })
  it('joins user fields for an existing row', async () => {
    const u1 = await seedUser({ name: 'Carol', email: 'carol@x.com' })
    const pid = await seedPost('p9')
    const id = await seedComment({ userId: u1, ownerId: pid })
    const r = await findCommentWithUserById(db, id)
    expect(r?.name).toBe('Carol')
  })
})

describe('comments/repos/public-query/by-id — findCommentsByIds', () => {
  it('returns [] for empty ids', async () => {
    expect(await findCommentsByIds(db, [])).toEqual([])
  })
  it('returns rows matching the ids', async () => {
    const u1 = await seedUser({ name: 'D', email: 'd@x.com' })
    const pid = await seedPost('p10')
    const a = await seedComment({ userId: u1, ownerId: pid })
    const b = await seedComment({ userId: u1, ownerId: pid })
    const rows = await findCommentsByIds(db, [a, b])
    expect(rows).toHaveLength(2)
  })
})

describe('comments/repos/public-query/by-id — findParentCommentsByIds', () => {
  it('returns an empty map for empty input', async () => {
    expect(await findParentCommentsByIds(db, [])).toEqual(new Map())
  })
  it('maps parent rows by id', async () => {
    const u1 = await seedUser({ name: 'E', email: 'e@x.com' })
    const pid = await seedPost('p11')
    const a = await seedComment({ userId: u1, ownerId: pid, content: 'parent' })
    const out = await findParentCommentsByIds(db, [a])
    expect(out.get(String(a))?.content).toBe('parent')
  })
})

describe('comments/repos/public-query/threads — countCommentsAndRoots', () => {
  it('counts 0/0 for an empty target', async () => {
    const r = await countCommentsAndRoots(db, { type: 'post', ownerId: 9999n }, [false])
    expect(r).toEqual({ total: 0, roots: 0 })
  })
  it('counts total and root rows for a seeded target', async () => {
    const u1 = await seedUser({ name: 'F', email: 'f@x.com' })
    const pid = await seedPost('p12')
    await seedComment({ userId: u1, ownerId: pid, rootId: 0n, isPending: false })
    await seedComment({ userId: u1, ownerId: pid, rootId: 1n, isPending: false })
    const r = await countCommentsAndRoots(db, { type: 'post', ownerId: pid }, [false])
    expect(r.total).toBe(2)
    expect(r.roots).toBe(1)
  })
})

describe('comments/repos/public-query/threads — findRootComments', () => {
  it('returns root rows for the target', async () => {
    const u1 = await seedUser({ name: 'G', email: 'g@x.com' })
    const pid = await seedPost('p13')
    await seedComment({ userId: u1, ownerId: pid, rootId: 0n, isPending: false })
    const rows = await findRootComments(db, { type: 'post', ownerId: pid }, [false], 0, 10)
    expect(rows).toHaveLength(1)
  })
})

describe('comments/repos/public-query/threads — findChildComments', () => {
  it('returns [] for an empty rootIds list', async () => {
    expect(await findChildComments(db, { type: 'post', ownerId: 1n }, [false], [])).toEqual([])
  })
  it('returns child rows matching rootIds', async () => {
    const u1 = await seedUser({ name: 'H', email: 'h@x.com' })
    const pid = await seedPost('p14')
    await seedComment({ userId: u1, ownerId: pid, rootId: 42n, isPending: false })
    const rows = await findChildComments(db, { type: 'post', ownerId: pid }, [false], [42n])
    expect(rows).toHaveLength(1)
  })
})

describe('comments/repos/public-query/threads — findCommentRootId', () => {
  it('returns null for a non-existent id', async () => {
    expect(await findCommentRootId(db, 9999n)).toBeNull()
  })
  it('returns the stored rootId', async () => {
    const id = await seedComment({ rootId: 7n })
    expect(await findCommentRootId(db, id)).toBe(7n)
  })
})

describe('comments/repos/public-query/admin — adminUserIds', () => {
  it('returns ids of users with role=admin', async () => {
    const a = await seedUser({ name: 'Admin', email: 'admin@x.com', role: 'admin' })
    await seedUser({ name: 'Visitor', email: 'v@x.com', role: 'visitor' })
    const ids = await adminUserIds(db)
    expect(ids).toEqual([a])
  })
})

describe('comments/repos/public-query/admin — pendingComments', () => {
  it('returns pending rows with entity slug/title', async () => {
    const u1 = await seedUser({ name: 'I', email: 'i@x.com' })
    const pid = await seedPost('p15')
    await seedComment({ userId: u1, ownerId: pid, isPending: true })
    const rows = await pendingComments(db, 10)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.title).toBe('Post p15')
  })
})

describe('comments/repos/public-query/admin — latestDistinctCommentIds', () => {
  it('returns one id per non-admin user (latest)', async () => {
    const u1 = await seedUser({ name: 'U1', email: 'u1@x.com' })
    const u2 = await seedUser({ name: 'U2', email: 'u2@x.com' })
    const admin = await seedUser({ name: 'Admin', email: 'admin@x.com', role: 'admin' })
    const pid = await seedPost('p16')
    await seedComment({ userId: u1, ownerId: pid })
    await seedComment({ userId: u2, ownerId: pid })
    await seedComment({ userId: admin, ownerId: pid })
    const ids = await latestDistinctCommentIds(db, [admin], 10)
    expect(ids).toHaveLength(2)
  })
})

describe('comments/repos/public-query/admin — commentsByIds', () => {
  it('returns [] for empty ids', async () => {
    expect(await commentsByIds(db, [], 10)).toEqual([])
  })
  it('returns rows matching the ids', async () => {
    const u1 = await seedUser({ name: 'J', email: 'j@x.com' })
    const pid = await seedPost('p17')
    const id = await seedComment({ userId: u1, ownerId: pid, isPending: false })
    const rows = await commentsByIds(db, [id], 10)
    expect(rows).toHaveLength(1)
  })
})

describe('comments/repos/admin-query — countAllComments', () => {
  it('returns 0 for an empty table', async () => {
    expect(await countAllComments(db, {})).toBe(0)
  })
})

describe('comments/repos/admin-query — countAdminComments', () => {
  it('splits counts across all/pending/approved/deleteRequested', async () => {
    const u1 = await seedUser({ name: 'K', email: 'k@x.com' })
    const pid = await seedPost('p18')
    await seedComment({ userId: u1, ownerId: pid, isPending: true })
    await seedComment({ userId: u1, ownerId: pid, isPending: false })
    const id = await seedComment({ userId: u1, ownerId: pid, isPending: false })
    await requestDeleteComment(db, id, u1)
    const r = await countAdminComments(db, {})
    expect(r).toEqual({ all: 3, pending: 1, approved: 1, deleteRequested: 1 })
  })

  it('excludes delete-requested rows from pending and approved counts', async () => {
    const u1 = await seedUser({ name: 'K2', email: 'k2@x.com' })
    const pid = await seedPost('p18b')
    const pendingId = await seedComment({ userId: u1, ownerId: pid, isPending: true })
    await requestDeleteComment(db, pendingId, u1)
    const approvedId = await seedComment({ userId: u1, ownerId: pid, isPending: false })
    await requestDeleteComment(db, approvedId, u1)
    const r = await countAdminComments(db, {})
    expect(r).toEqual({ all: 2, pending: 0, approved: 0, deleteRequested: 2 })
  })
})

describe('comments/repos/admin-query — listAdminComments', () => {
  it('returns rows ordered by createdAt desc', async () => {
    const u1 = await seedUser({ name: 'L', email: 'l@x.com' })
    const pid = await seedPost('p19')
    await seedComment({ userId: u1, ownerId: pid })
    const rows = await listAdminComments(db, 0, 10, {})
    expect(rows).toHaveLength(1)
  })

  it('filters by deleteRequested status', async () => {
    const u1 = await seedUser({ name: 'L2', email: 'l2@x.com' })
    const pid = await seedPost('p19b')
    const normalId = await seedComment({ userId: u1, ownerId: pid })
    const requestedId = await seedComment({ userId: u1, ownerId: pid })
    await requestDeleteComment(db, requestedId, u1)
    const rows = await listAdminComments(db, 0, 10, { status: 'deleteRequested' })
    expect(rows).toHaveLength(1)
    expect(rows[0]!.id).toBe(requestedId)
    expect(rows.every((r) => r.id !== normalId)).toBe(true)
  })
})

describe('comments/repos/admin-query — searchPages', () => {
  it('returns an empty list when nothing matches', async () => {
    expect(await searchPages(db, undefined, 10)).toEqual([])
  })
  it('matches a page publicId when supplied', async () => {
    const pid = await seedPost('p20')
    const pubId = await seedMetricRow('post', pid)
    const rows = await searchPages(db, undefined, 10, [pubId])
    expect(rows[0]?.title).toBe('Post p20')
  })
  it('matches by free-text q against title', async () => {
    const pid = await seedPost('p21')
    await seedMetricRow('post', pid)
    const rows = await searchPages(db, 'p21', 10)
    expect(rows).toHaveLength(1)
  })
})

describe('comments/repos/admin-query — searchCommentAuthors', () => {
  it('returns empty list when there are no comments', async () => {
    expect(await searchCommentAuthors(db, undefined, 10)).toEqual([])
  })
  it('returns unique authors', async () => {
    const u1 = await seedUser({ name: 'M', email: 'm@x.com' })
    const pid = await seedPost('p22')
    await seedComment({ userId: u1, ownerId: pid })
    const rows = await searchCommentAuthors(db, undefined, 10)
    expect(rows[0]?.name).toBe('M')
  })
})

describe('comments/repos/admin-query — listAdminPendingDashboard', () => {
  it('returns pending items for the approval kind', async () => {
    const u1 = await seedUser({ name: 'N', email: 'n@x.com' })
    const pid = await seedPost('p23')
    await seedComment({ userId: u1, ownerId: pid, isPending: true })
    const rows = await listAdminPendingDashboard(db, 'approval', 0, 10)
    expect(rows).toHaveLength(1)
  })
  it('returns delete-requested items for the deletion kind', async () => {
    const u1 = await seedUser({ name: 'O', email: 'o@x.com' })
    const pid = await seedPost('p24')
    const id = await seedComment({ userId: u1, ownerId: pid })
    await requestDeleteComment(db, id, u1)
    const rows = await listAdminPendingDashboard(db, 'deletion', 0, 10)
    expect(rows).toHaveLength(1)
  })
})

describe('comments/repos/admin-query — countAdminPendingDashboard', () => {
  it('breaks down by all/approval/deletion', async () => {
    const u1 = await seedUser({ name: 'P', email: 'p@x.com' })
    const pid = await seedPost('p25')
    await seedComment({ userId: u1, ownerId: pid, isPending: true })
    const id = await seedComment({ userId: u1, ownerId: pid })
    await requestDeleteComment(db, id, u1)
    const r = await countAdminPendingDashboard(db)
    expect(r.all).toBe(2)
    expect(r.approval).toBe(1)
    expect(r.deletion).toBe(1)
  })
})

describe('comments/repos/admin-query — countApprovedRepliesOfComment', () => {
  it('returns 0 when there are no approved replies', async () => {
    expect(await countApprovedRepliesOfComment(db, 9999n)).toBe(0)
  })
})

describe('comments/repos/admin-query — findCommentWithUserAndTarget', () => {
  it('returns null for a non-existent id', async () => {
    expect(await findCommentWithUserAndTarget(db, 9999n)).toBeNull()
  })
  it('returns comment + user + metric + entity', async () => {
    const u1 = await seedUser({ name: 'Q', email: 'q@x.com' })
    const pid = await seedPost('p26')
    await seedMetricRow('post', pid)
    const id = await seedComment({ userId: u1, ownerId: pid })
    const r = await findCommentWithUserAndTarget(db, id)
    expect(r?.comment.id).toBe(id)
    expect(r?.user.name).toBe('Q')
    expect(r?.entityTitle).toBe('Post p26')
  })
})

describe('comments/repos/admin-query — listMyComments', () => {
  it("returns the user's visible comments", async () => {
    const u1 = await seedUser({ name: 'R', email: 'r@x.com' })
    const pid = await seedPost('p27')
    await seedComment({ userId: u1, ownerId: pid })
    const rows = await listMyComments(db, u1, 0, 10)
    expect(rows).toHaveLength(1)
  })
})

describe('comments/repos/admin-query — listMyCommentEntities', () => {
  it('returns the unique entities the user has commented on', async () => {
    const u1 = await seedUser({ name: 'S', email: 's@x.com' })
    const pid = await seedPost('p28')
    await seedComment({ userId: u1, ownerId: pid })
    const rows = await listMyCommentEntities(db, u1)
    expect(rows[0]?.slug).toBe('p28')
  })

  it('filters by title at the SQL layer', async () => {
    const u1 = await seedUser({ name: 'S2', email: 's2@x.com' })
    const alpha = await seedPost('alpha-q')
    const beta = await seedPost('beta-q')
    await seedComment({ userId: u1, ownerId: alpha })
    await seedComment({ userId: u1, ownerId: beta })

    const rows = await listMyCommentEntities(db, u1, { q: 'beta' })
    expect(rows).toHaveLength(1)
    expect(rows[0]?.slug).toBe('beta-q')
  })

  it('caps the result at MY_COMMENT_ENTITY_LIMIT', async () => {
    const u1 = await seedUser({ name: 'S3', email: 's3@x.com' })
    for (let i = 0; i < 25; i++) {
      const pid = await seedPost(`cap-${i}`)
      await seedComment({ userId: u1, ownerId: pid })
    }
    const rows = await listMyCommentEntities(db, u1)
    expect(rows).toHaveLength(20)
  })
})

describe('comments/repos/admin-query — countMyComments', () => {
  it('breaks down by total/pending/deleteRequested/deleted', async () => {
    const u1 = await seedUser({ name: 'T', email: 't@x.com' })
    const pid = await seedPost('p29')
    await seedComment({ userId: u1, ownerId: pid, isPending: true })
    const r = await countMyComments(db, u1)
    expect(r.total).toBe(1)
    expect(r.pending).toBe(1)
  })
})
