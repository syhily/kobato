import { call } from '@orpc/server'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { makeAuthedCtx } from '#/_helpers/mock-ctx'
import { getDatabaseHandle } from '@/server/bootstrap/db-lifecycle'
import { flushAuditLog } from '@/server/domains/audit/services/batcher'
import { adminCommentsRouter } from '@/server/http/controllers/admin/comments.controller'
import { initAllBatchers, resetAllBatchers } from '@/server/infra/db/batcher-registry'
import { comment } from '@/server/infra/db/schema/comment'
import { auditLog } from '@/server/infra/db/schema/config'
import { metric } from '@/server/infra/db/schema/metric'
import { post } from '@/server/infra/db/schema/post'
import { user } from '@/server/infra/db/schema/user'

// De-mocked controller coverage: projection/admin-query/moderate services run real
// against seeded rows; moderation pinned by DB state + audit rows.

const db = getTestDb()

beforeEach(async () => {
  await clearAllTables(db)
  initAllBatchers(getDatabaseHandle())
})

afterEach(async () => {
  // Flush BEFORE reset: a failed test must not strand rows in a torn-down batcher.
  await flushAuditLog()
  resetAllBatchers()
})

let seq = 0

async function seedUser(opts: Partial<typeof user.$inferInsert> = {}): Promise<number> {
  const rows = await db
    .insert(user)
    .values({
      name: opts.name ?? 'Alice',
      email: opts.email ?? `alice-${++seq}@example.com`,
      password: 'hashed',
      role: 'visitor',
      ...opts,
    })
    .returning({ id: user.id })
  return rows[0]!.id
}

// audit_log.actor_id is an FK: the admin viewer must be a real row.
async function seedAdmin(): Promise<number> {
  return seedUser({ name: 'Admin', email: `admin-${++seq}@example.com`, role: 'admin' })
}

async function seedPost(title: string, slug: string): Promise<number> {
  const rows = await db
    .insert(post)
    .values({
      slug,
      title,
      summary: '',
      published: true,
      publishedRevisionId: 1,
    })
    .returning({ id: post.id })
  return rows[0]!.id
}

async function seedMetricRow(ownerId: number, publicId: string): Promise<string> {
  await db.insert(metric).values({ type: 'post', ownerId, publicId })
  return publicId
}

async function seedComment(opts: Partial<typeof comment.$inferInsert> = {}): Promise<number> {
  const rows = await db
    .insert(comment)
    .values({
      type: opts.type ?? 'post',
      ownerId: opts.ownerId ?? 1,
      userId: opts.userId ?? 1,
      content: opts.content ?? 'hello',
      body: opts.body ?? [],
      rid: opts.rid ?? 0,
      rootId: opts.rootId ?? 0,
      isPending: opts.isPending ?? false,
      ...opts,
    })
    .returning({ id: comment.id })
  return rows[0]!.id
}

function adminCtx(adminId: number) {
  return makeAuthedCtx({ userId: String(adminId), role: 'admin', db })
}

async function auditRowsFor(action: string) {
  await flushAuditLog()
  return db.select().from(auditLog).where(eq(auditLog.action, action))
}

describe('adminCommentsRouter.approve', () => {
  it('approves the comment and records a comment_approved audit row', async () => {
    const admin = await seedAdmin()
    const uid = await seedUser()
    const pid = await seedPost('Approve Post', 'approve-post')
    const cid = await seedComment({ userId: uid, ownerId: pid, isPending: true })

    const res = await call(adminCommentsRouter.approve, { commentId: String(cid) }, { context: adminCtx(admin) })

    expect(res).toBeUndefined()
    const [row] = await db.select().from(comment).where(eq(comment.id, cid))
    expect(row!.isPending).toBe(false)

    const rows = await auditRowsFor('comment_approved')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.resourceType).toBe('comment')
    expect(rows[0]!.resourceId).toBe(String(cid))
    expect(rows[0]!.actorId).toBe(admin)
  })
})

describe('adminCommentsRouter.delete', () => {
  it('hard-deletes the comment and records a comment_deleted audit row', async () => {
    const admin = await seedAdmin()
    const uid = await seedUser()
    const pid = await seedPost('Delete Post', 'delete-post')
    const cid = await seedComment({ userId: uid, ownerId: pid })

    const res = await call(adminCommentsRouter.delete, { commentId: String(cid) }, { context: adminCtx(admin) })

    expect(res).toBeUndefined()
    const remaining = await db.select().from(comment).where(eq(comment.id, cid))
    expect(remaining).toHaveLength(0)

    const rows = await auditRowsFor('comment_deleted')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.resourceType).toBe('comment')
    expect(rows[0]!.resourceId).toBe(String(cid))
    expect(rows[0]!.actorId).toBe(admin)
  })
})

describe('adminCommentsRouter.loadAll', () => {
  it('returns comments, total, hasMore and statusCounts', async () => {
    const uid = await seedUser()
    const pid = await seedPost('Post 1', 'post-1')
    const publicId = await seedMetricRow(pid, 'pid-1')
    const cid = await seedComment({ userId: uid, ownerId: pid, content: 'hello' })

    const res = await call(
      adminCommentsRouter.loadAll,
      { offset: 0, limit: 20, status: 'all' },
      { context: makeAuthedCtx({ db }) },
    )

    expect(res.comments).toHaveLength(1)
    expect(res.comments[0]).toMatchObject({
      id: String(cid),
      name: 'Alice',
      pageTitle: 'Post 1',
      pagePublicId: publicId,
      isPending: false,
    })
    expect(res.total).toBe(1)
    expect(res.hasMore).toBe(false)
    expect(res.statusCounts).toEqual({ all: 1, pending: 0, approved: 1, deleteRequested: 0 })
  })

  it('accepts `status: "deleteRequested"` and returns only rows with a pending delete request', async () => {
    const uid = await seedUser()
    const pid = await seedPost('Delete Requested Post', 'delete-requested-post')
    const requested = await seedComment({
      userId: uid,
      ownerId: pid,
      deleteRequestedAt: new Date(),
      deleteRequestedBy: uid,
    })
    await seedComment({ userId: uid, ownerId: pid, content: 'plain' })

    const res = await call(
      adminCommentsRouter.loadAll,
      { offset: 0, limit: 20, status: 'deleteRequested' },
      { context: makeAuthedCtx({ db }) },
    )

    expect(res.comments.map((c) => c.id)).toEqual([String(requested)])
    expect(res.total).toBe(1)
    expect(res.statusCounts).toEqual({ all: 2, pending: 0, approved: 1, deleteRequested: 1 })
  })

  it('narrows the result to rows containing `q` under `match: "contains"`', async () => {
    const uid = await seedUser()
    const pid = await seedPost('Contains Post', 'contains-post')
    const foo = await seedComment({ userId: uid, ownerId: pid, content: 'foo one' })
    await seedComment({ userId: uid, ownerId: pid, content: 'bar three' })

    const res = await call(
      adminCommentsRouter.loadAll,
      { offset: 0, limit: 20, q: 'foo', match: 'contains' },
      { context: makeAuthedCtx({ db }) },
    )

    expect(res.comments.map((c) => c.id)).toEqual([String(foo)])
    expect(res.total).toBe(1)
    expect(res.statusCounts).toEqual({ all: 1, pending: 0, approved: 1, deleteRequested: 0 })
  })

  it('excludes rows containing `q` under `match: "does-not-contain"`', async () => {
    const uid = await seedUser()
    const pid = await seedPost('Inverse Post', 'inverse-post')
    await seedComment({ userId: uid, ownerId: pid, content: 'spam x', isPending: true })
    const clean = await seedComment({ userId: uid, ownerId: pid, content: 'clean y', isPending: true })

    const res = await call(
      adminCommentsRouter.loadAll,
      { offset: 0, limit: 20, q: 'spam', match: 'does-not-contain' },
      { context: makeAuthedCtx({ db }) },
    )

    expect(res.comments.map((c) => c.id)).toEqual([String(clean)])
    expect(res.total).toBe(1)
    expect(res.statusCounts).toEqual({ all: 1, pending: 1, approved: 0, deleteRequested: 0 })
  })

  it('rejects an unknown `match` value (Zod validation)', async () => {
    await expect(
      call(
        adminCommentsRouter.loadAll,
        { offset: 0, limit: 20, q: 'foo', match: 'equals' as 'contains' },
        { context: makeAuthedCtx({ db }) },
      ),
    ).rejects.toBeDefined()
  })

  it('trims `q` before filtering — a padded query still matches (Zod `.trim()`)', async () => {
    const uid = await seedUser()
    const pid = await seedPost('Trim Post', 'trim-post')
    const foo = await seedComment({ userId: uid, ownerId: pid, content: 'foo one' })
    await seedComment({ userId: uid, ownerId: pid, content: 'bar three' })

    const res = await call(
      adminCommentsRouter.loadAll,
      { offset: 0, limit: 20, q: '  foo  ', match: 'contains' },
      { context: makeAuthedCtx({ db }) },
    )

    expect(res.comments.map((c) => c.id)).toEqual([String(foo)])
    expect(res.total).toBe(1)
  })

  it('narrows the result to the `createdAfter`/`createdBefore` window', async () => {
    const uid = await seedUser()
    const pid = await seedPost('Window Post', 'window-post')
    await seedComment({
      userId: uid,
      ownerId: pid,
      content: 'too early',
      createdAt: new Date('2026-05-15T00:00:00.000Z'),
    })
    const inWindow = await seedComment({
      userId: uid,
      ownerId: pid,
      content: 'in window',
      createdAt: new Date('2026-06-15T00:00:00.000Z'),
    })
    await seedComment({
      userId: uid,
      ownerId: pid,
      content: 'too late',
      createdAt: new Date('2026-07-15T00:00:00.000Z'),
    })

    const res = await call(
      adminCommentsRouter.loadAll,
      {
        offset: 0,
        limit: 20,
        createdAfter: '2026-06-01T00:00:00.000Z',
        createdBefore: '2026-06-30T23:59:59.999Z',
      },
      { context: makeAuthedCtx({ db }) },
    )

    expect(res.comments.map((c) => c.id)).toEqual([String(inWindow)])
    expect(res.total).toBe(1)
    expect(res.statusCounts).toEqual({ all: 1, pending: 0, approved: 1, deleteRequested: 0 })
  })

  it('rejects a malformed `createdAfter` (Zod ISO datetime validation)', async () => {
    await expect(
      call(
        adminCommentsRouter.loadAll,
        { offset: 0, limit: 20, createdAfter: 'not-a-date' },
        { context: makeAuthedCtx({ db }) },
      ),
    ).rejects.toBeDefined()
  })

  it('rejects a malformed `createdBefore` (Zod ISO datetime validation)', async () => {
    await expect(
      call(
        adminCommentsRouter.loadAll,
        { offset: 0, limit: 20, createdBefore: '2026-13-99' },
        { context: makeAuthedCtx({ db }) },
      ),
    ).rejects.toBeDefined()
  })
})

describe('adminCommentsRouter.searchPages', () => {
  it('returns pages matching query', async () => {
    const pid = await seedPost('Page 1', 'page-1')
    await seedMetricRow(pid, 'p1')

    const res = await call(adminCommentsRouter.searchPages, { q: 'page' }, { context: makeAuthedCtx({ db }) })

    expect(res.pages).toHaveLength(1)
    expect(res.pages[0]).toEqual({ key: 'p1', title: 'Page 1' })
  })
})

describe('adminCommentsRouter.searchAuthors', () => {
  it('returns authors matching query', async () => {
    const uid = await seedUser({ name: 'Alice' })
    const pid = await seedPost('Author Post', 'author-post')
    await seedComment({ userId: uid, ownerId: pid })

    const res = await call(adminCommentsRouter.searchAuthors, { q: 'alice' }, { context: makeAuthedCtx({ db }) })

    expect(res.authors).toHaveLength(1)
    expect(res.authors[0]).toEqual({ id: String(uid), name: 'Alice' })
  })
})

describe('adminCommentsRouter.approveCommentDeletion', () => {
  // The state machine is pinned at the domain seam; here only the controller's error
  // translation and audit plumbing run.
  it('approving soft-deletes the comment and audits comment_delete_request_approved', async () => {
    const admin = await seedAdmin()
    const uid = await seedUser()
    const pid = await seedPost('Approve Deletion Post', 'approve-deletion-post')
    const cid = await seedComment({
      userId: uid,
      ownerId: pid,
      deleteRequestedAt: new Date(),
      deleteRequestedBy: uid,
    })

    const res = await call(
      adminCommentsRouter.approveCommentDeletion,
      { commentId: String(cid), approve: true },
      { context: adminCtx(admin) },
    )

    expect(res).toEqual({ success: true })
    const [row] = await db.select().from(comment).where(eq(comment.id, cid))
    expect(row!.deletedAt).not.toBeNull()

    const rows = await auditRowsFor('comment_delete_request_approved')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.resourceType).toBe('comment')
    expect(rows[0]!.resourceId).toBe(String(cid))
    expect(rows[0]!.actorId).toBe(admin)
  })

  it('rejecting clears the delete request and audits comment_delete_request_rejected', async () => {
    const admin = await seedAdmin()
    const uid = await seedUser()
    const pid = await seedPost('Reject Deletion Post', 'reject-deletion-post')
    const cid = await seedComment({
      userId: uid,
      ownerId: pid,
      deleteRequestedAt: new Date(),
      deleteRequestedBy: uid,
    })

    const res = await call(
      adminCommentsRouter.approveCommentDeletion,
      { commentId: String(cid), approve: false },
      { context: adminCtx(admin) },
    )

    expect(res).toEqual({ success: true })
    const [row] = await db.select().from(comment).where(eq(comment.id, cid))
    expect(row!.deletedAt).toBeNull()
    expect(row!.deleteRequestedAt).toBeNull()
    expect(row!.deleteRequestedBy).toBeNull()

    const rows = await auditRowsFor('comment_delete_request_rejected')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.resourceType).toBe('comment')
    expect(rows[0]!.resourceId).toBe(String(cid))
    expect(rows[0]!.actorId).toBe(admin)
  })

  it('translates a domain NOT_FOUND onto the wire for a nonexistent comment', async () => {
    const admin = await seedAdmin()
    await expect(
      call(
        adminCommentsRouter.approveCommentDeletion,
        { commentId: '424242', approve: true },
        { context: adminCtx(admin) },
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('translates a domain CONFLICT onto the wire when no delete request is pending', async () => {
    const admin = await seedAdmin()
    const uid = await seedUser()
    const pid = await seedPost('No Request Post', 'no-request-post')
    const cid = await seedComment({ userId: uid, ownerId: pid })

    await expect(
      call(
        adminCommentsRouter.approveCommentDeletion,
        { commentId: String(cid), approve: true },
        { context: adminCtx(admin) },
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' })

    // The fence fired before any write: no soft-delete, no audit event.
    const [row] = await db.select().from(comment).where(eq(comment.id, cid))
    expect(row!.deletedAt).toBeNull()
    expect(await auditRowsFor('comment_delete_request_approved')).toHaveLength(0)
  })
})

describe('adminCommentsRouter.listPendingDashboard', () => {
  it('returns pending dashboard items', async () => {
    const uid = await seedUser({ name: 'Alice' })
    const pid = await seedPost('Post 1', 'hello')
    const cid = await seedComment({ userId: uid, ownerId: pid, content: 'Hello', isPending: true })

    const res = await call(adminCommentsRouter.listPendingDashboard, {}, { context: makeAuthedCtx({ db }) })

    expect(res.items).toHaveLength(1)
    expect(res.items[0]).toMatchObject({
      id: String(cid),
      kind: 'approval',
      authorName: 'Alice',
      excerpt: 'Hello',
      deleteRequestedAtIso: null,
      pageTitle: 'Post 1',
      pagePermalink: '/posts/hello',
    })
    expect(res.total).toBe(1)
    expect(res.hasMore).toBe(false)
    expect(res.counts).toEqual({ all: 1, approval: 1, deletion: 0 })
  })
})
