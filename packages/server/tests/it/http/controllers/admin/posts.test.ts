import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { makeAuthedCtx } from '#/_helpers/mock-ctx'

import { getDatabaseHandle } from '@kobato/server/bootstrap/db-lifecycle'
import { flushAuditLog } from '@kobato/server/domains/audit/services/batcher'
import { adminPostsRouter } from '@kobato/server/http/controllers/admin/posts.controller'
import { initAllBatchers, resetAllBatchers } from '@kobato/server/infra/db/batcher-registry'
import { auditLog } from '@kobato/server/infra/db/schema/config'
import { content as contentTable } from '@kobato/server/infra/db/schema/content'
import { post as postTable } from '@kobato/server/infra/db/schema/post'
import { user } from '@kobato/server/infra/db/schema/user'
import { EMPTY_LEXICAL_BODY } from '@kobato/shared/lexical/schema'
import { call } from '@orpc/server'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Only the body lifecycle stays mocked: saveBody/previewBody are the
// composition-root neighbours of this controller and are covered by the
// content-domain integration tests. The admin query, the meta mutations,
// and the audit pipeline all run against the real in-memory db.
vi.mock('@kobato/server/domains/content/lifecycle', () => ({
  previewBody: vi.fn(),
  saveBody: vi.fn(),
}))

const lifecycle = await import('@kobato/server/domains/content/lifecycle')

const db = getTestDb()

let seq = 0

beforeEach(async () => {
  await clearAllTables(db)
  initAllBatchers(getDatabaseHandle())
  vi.clearAllMocks()
})

afterEach(async () => {
  // Flush BEFORE dropping the batcher so no stale events leak into the
  // next case's queue (see auth/password-flow for the full rationale).
  await flushAuditLog()
  resetAllBatchers()
})

// audit_log.actor_id references user.id, so the admin viewer must be a
// real row for the batched audit insert to survive the FK.
async function seedAdmin(): Promise<number> {
  const [row] = await db
    .insert(user)
    .values({ name: 'Admin', email: `admin-${++seq}@example.com`, password: 'hashed', role: 'admin' })
    .returning({ id: user.id })
  return row.id
}

async function seedPost(overrides: Partial<typeof postTable.$inferInsert> = {}) {
  const [row] = await db
    .insert(postTable)
    .values({
      slug: `post-${++seq}`,
      title: 'Seeded Post',
      published: true,
      publishedAt: new Date('2026-01-01'),
      ...overrides,
    })
    .returning()
  return row
}

// The double-table fixture: a post row plus a content/revision row the
// post points at via published_revision_id.
async function seedPublishedRevision(postId: number): Promise<number> {
  const [rev] = await db
    .insert(contentTable)
    .values({ type: 'post', ownerId: postId, revisionNo: 1, status: 'published', body: EMPTY_LEXICAL_BODY })
    .returning({ id: contentTable.id })
  await db.update(postTable).set({ publishedRevisionId: rev.id }).where(eq(postTable.id, postId))
  return rev.id
}

function adminCtx(userId: number) {
  return makeAuthedCtx({ userId: String(userId), role: 'admin', db })
}

describe('adminPostsRouter.get', () => {
  it('surfaces NOT_FOUND for a real missing id', async () => {
    await expect(call(adminPostsRouter.get, { id: '999' }, { context: makeAuthedCtx({ db }) })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })

  it('returns the detail dto for the seeded post + published revision', async () => {
    const seeded = await seedPost({ slug: 'hello-world', title: 'Hello World' })
    const revisionId = await seedPublishedRevision(seeded.id)

    const res = await call(adminPostsRouter.get, { id: String(seeded.id) }, { context: makeAuthedCtx({ db }) })

    expect(res.post).toMatchObject({
      id: String(seeded.id),
      slug: 'hello-world',
      title: 'Hello World',
      publishedRevisionId: String(revisionId),
    })
    expect(res.publishedRevision?.id).toBe(String(revisionId))
    expect(res.latestRevision?.id).toBe(String(revisionId))
  })
})

describe('adminPostsRouter.delete', () => {
  it('throws NOT_FOUND when deletePost yields { deleted: false } (real missing id)', async () => {
    const admin = await seedAdmin()
    await expect(call(adminPostsRouter.delete, { id: '999' }, { context: adminCtx(admin) })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })

  it('soft-deletes the row, resolves to undefined (z.void output), and audits post_deleted', async () => {
    const admin = await seedAdmin()
    const seeded = await seedPost()

    const res = await call(adminPostsRouter.delete, { id: String(seeded.id) }, { context: adminCtx(admin) })

    expect(res).toBeUndefined()
    const [row] = await db.select().from(postTable).where(eq(postTable.id, seeded.id))
    expect(row).toBeDefined()
    expect(row!.deletedAt).not.toBeNull()

    await flushAuditLog()
    const rows = await db.select().from(auditLog).where(eq(auditLog.action, 'post_deleted'))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      resourceType: 'post',
      resourceId: String(seeded.id),
      actorId: admin,
      actorRole: 'admin',
    })
  })
})

describe('adminPostsRouter.saveDraft', () => {
  it('discriminates `saved` and `conflict` shapes on the union response', async () => {
    const admin = await seedAdmin()
    const revision = {
      id: '1',
      revisionNo: 1,
      status: 'draft' as const,
      body: EMPTY_LEXICAL_BODY,
      imageSources: [],
      headings: [],
      authorId: '1',
      clientRevisionToken: '00000000-0000-4000-8000-000000000000',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    vi.mocked(lifecycle.saveBody).mockResolvedValueOnce({
      status: 'saved',
      revision: revision,
    })

    const res = (await call(
      adminPostsRouter.saveDraft,
      { id: '1', body: EMPTY_LEXICAL_BODY, expectedClientRevisionToken: '00000000-0000-4000-8000-000000000000' },
      { context: adminCtx(admin) },
    )) as { status: string }
    expect(res.status).toBe('saved')

    // The `saved` branch records a draft audit through the real batcher.
    await flushAuditLog()
    const rows = await db.select().from(auditLog).where(eq(auditLog.action, 'post_draft_saved'))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ resourceType: 'post', resourceId: '1', actorId: admin })
  })
})
