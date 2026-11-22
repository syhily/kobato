import { sqliteOf } from '@kobato/db/database'
import { auditLog } from '@kobato/db/schema/config'
import { content as contentTable } from '@kobato/db/schema/content'
import { post as postTable } from '@kobato/db/schema/post'
import { user } from '@kobato/db/schema/user'
import { getDatabaseHandle } from '@kobato/server/bootstrap/db-lifecycle'
import { flushAuditLog } from '@kobato/server/domains/audit/services/batcher'
import { adminPostsRouter } from '@kobato/server/http/controllers/admin/posts.controller'
import { initAllBatchers, resetAllBatchers } from '@kobato/server/infra/db/batcher-registry'
import { clearAllTables, getTestDb } from '@kobato/server/tests/utils/integration-db'
import { emptyLexicalBody } from '@kobato/server/tests/utils/lexical'
import { makeAuthedCtx } from '@kobato/server/tests/utils/mock-ctx'
import { call } from '@orpc/server'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const db = getTestDb()

let seq = 0

beforeEach(async () => {
  await clearAllTables(db)
  initAllBatchers(getDatabaseHandle())
  vi.clearAllMocks()
})

afterEach(async () => {
  await flushAuditLog()
  resetAllBatchers()
})

async function seedAdmin(): Promise<number> {
  const [row] = await sqliteOf(db)
    .insert(user)
    .values({ name: 'Admin', email: `admin-${++seq}@example.com`, password: 'hashed', role: 'admin' })
    .returning({ id: user.id })
  return row.id
}

async function seedPost(overrides: Partial<typeof postTable.$inferInsert> = {}) {
  const [row] = await sqliteOf(db)
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

async function seedPublishedRevision(postId: number): Promise<number> {
  const [rev] = await sqliteOf(db)
    .insert(contentTable)
    .values({ type: 'post', ownerId: postId, revisionNo: 1, status: 'published', body: emptyLexicalBody() })
    .returning({ id: contentTable.id })
  await sqliteOf(db).update(postTable).set({ publishedRevisionId: rev.id }).where(eq(postTable.id, postId))
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
    const [row] = await sqliteOf(db).select().from(postTable).where(eq(postTable.id, seeded.id))
    expect(row).toBeDefined()
    expect(row!.deletedAt).not.toBeNull()

    await flushAuditLog()
    const rows = await sqliteOf(db).select().from(auditLog).where(eq(auditLog.action, 'post_deleted'))
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
  it('saves a real draft revision and audits post_draft_saved', async () => {
    const admin = await seedAdmin()
    const seeded = await seedPost()

    const res = (await call(
      adminPostsRouter.saveDraft,
      { id: String(seeded.id), body: emptyLexicalBody(), expectedClientRevisionToken: null },
      { context: adminCtx(admin) },
    )) as { status: string; revision?: { id: string; status: string } }
    expect(res.status).toBe('saved')
    expect(res.revision?.status).toBe('draft')

    await flushAuditLog()
    const rows = await sqliteOf(db).select().from(auditLog).where(eq(auditLog.action, 'post_draft_saved'))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ resourceType: 'post', resourceId: String(seeded.id), actorId: admin })
  })
})
