import { sqliteOf } from '@kobato/db/database'
import { auditLog } from '@kobato/db/schema/config'
import { content } from '@kobato/db/schema/content'
import { page as pageTable } from '@kobato/db/schema/page'
import { user } from '@kobato/db/schema/user'
import { getDatabaseHandle } from '@kobato/server/bootstrap/db-lifecycle'
import { flushAuditLog } from '@kobato/server/domains/audit/services/batcher'
import { adminPagesRouter } from '@kobato/server/http/controllers/admin/pages.controller'
import { initAllBatchers, resetAllBatchers } from '@kobato/server/infra/db/batcher-registry'
import { clearAllTables, getTestDb } from '@kobato/server/tests/utils/integration-db'
import { emptyLexicalBody } from '@kobato/server/tests/utils/lexical'
import { makeAuthedCtx } from '@kobato/server/tests/utils/mock-ctx'
import { call } from '@orpc/server'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const db = getTestDb()

beforeEach(async () => {
  await clearAllTables(db)
  initAllBatchers(getDatabaseHandle())
})

afterEach(async () => {
  await flushAuditLog()
  resetAllBatchers()
})

let seq = 0

async function seedPage(overrides: Partial<typeof pageTable.$inferInsert> = {}) {
  const [row] = await sqliteOf(db)
    .insert(pageTable)
    .values({
      slug: overrides.slug ?? `page-${++seq}-${Math.random().toString(36).slice(2)}`,
      title: overrides.title ?? 'Test',
      ...overrides,
    })
    .returning()
  return row!
}

async function seedRevision(ownerId: number, revisionNo: number, status: 'draft' | 'published' = 'published') {
  const [row] = await sqliteOf(db)
    .insert(content)
    .values({
      type: 'page',
      ownerId,
      revisionNo,
      status,
      body: emptyLexicalBody(),
      imageSources: [],
      headings: [],
    })
    .returning()
  return row!
}

async function seedAdmin(): Promise<number> {
  const [row] = await sqliteOf(db)
    .insert(user)
    .values({ name: 'Admin', email: `admin-${++seq}@example.com`, password: 'hashed', role: 'admin' })
    .returning({ id: user.id })
  return row!.id
}

function adminCtx(userId: number) {
  return makeAuthedCtx({ userId: String(userId), role: 'admin', db })
}

async function auditRowsFor(action: string) {
  await flushAuditLog()
  return sqliteOf(db).select().from(auditLog).where(eq(auditLog.action, action))
}

describe('adminPagesRouter.get', () => {
  it('surfaces NOT_FOUND for a missing page', async () => {
    const ctx = makeAuthedCtx({ db })
    await expect(call(adminPagesRouter.get, { id: '999' }, { context: ctx })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })

  it('passes through the detail dto of the seeded page', async () => {
    const seeded = await seedPage({ slug: 'about', title: 'About', published: true })
    const ctx = makeAuthedCtx({ db })
    const res = await call(adminPagesRouter.get, { id: String(seeded.id) }, { context: ctx })
    expect(res.page).toMatchObject({
      id: String(seeded.id),
      slug: 'about',
      title: 'About',
      published: true,
    })
    expect(res.latestRevision).toBeNull()
    expect(res.publishedRevision).toBeNull()
  })
})

describe('adminPagesRouter.delete', () => {
  it('throws NOT_FOUND for a missing page', async () => {
    const ctx = makeAuthedCtx({ db })
    await expect(call(adminPagesRouter.delete, { id: '999' }, { context: ctx })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })

  it('soft-deletes the row and records a page_deleted audit row', async () => {
    const admin = await seedAdmin()
    const seeded = await seedPage()

    const res = await call(adminPagesRouter.delete, { id: String(seeded.id) }, { context: adminCtx(admin) })

    expect(res).toBeUndefined()
    const [row] = await sqliteOf(db).select().from(pageTable).where(eq(pageTable.id, seeded.id))
    expect(row!.deletedAt).not.toBeNull()

    const audits = await auditRowsFor('page_deleted')
    expect(audits).toHaveLength(1)
    expect(audits[0]).toMatchObject({
      resourceType: 'page',
      resourceId: String(seeded.id),
      actorId: admin,
    })
  })
})

describe('adminPagesRouter.restore', () => {
  it('restores a soft-deleted page and records a page_restored audit row', async () => {
    const admin = await seedAdmin()
    const seeded = await seedPage({ deletedAt: new Date() })

    const res = await call(adminPagesRouter.restore, { id: String(seeded.id) }, { context: adminCtx(admin) })

    expect(res).toEqual({ success: true })
    const [row] = await sqliteOf(db).select().from(pageTable).where(eq(pageTable.id, seeded.id))
    expect(row!.deletedAt).toBeNull()

    const audits = await auditRowsFor('page_restored')
    expect(audits).toHaveLength(1)
    expect(audits[0]).toMatchObject({
      resourceType: 'page',
      resourceId: String(seeded.id),
      actorId: admin,
    })
  })

  it('throws NOT_FOUND for a missing page', async () => {
    const ctx = makeAuthedCtx({ db })
    await expect(call(adminPagesRouter.restore, { id: '999' }, { context: ctx })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })
})

describe('adminPagesRouter.unpublish', () => {
  it('flips the published flag for real and records a page_unpublished audit row', async () => {
    const admin = await seedAdmin()
    const seeded = await seedPage({ published: true })

    const res = await call(adminPagesRouter.unpublish, { id: String(seeded.id) }, { context: adminCtx(admin) })

    expect(res.page.id).toBe(String(seeded.id))
    expect(res.page.published).toBe(false)
    const [row] = await sqliteOf(db).select().from(pageTable).where(eq(pageTable.id, seeded.id))
    expect(row!.published).toBe(false)

    const audits = await auditRowsFor('page_unpublished')
    expect(audits).toHaveLength(1)
    expect(audits[0]).toMatchObject({
      resourceType: 'page',
      resourceId: String(seeded.id),
      actorId: admin,
    })
  })
})

describe('adminPagesRouter.saveDraft', () => {
  it('saves a real draft revision and records a page_draft_saved audit row', async () => {
    const admin = await seedAdmin()
    const seeded = await seedPage()
    const res = await call(
      adminPagesRouter.saveDraft,
      { id: String(seeded.id), body: emptyLexicalBody(), expectedClientRevisionToken: null },
      { context: adminCtx(admin) },
    )
    expect(res.status).toBe('saved')

    const audits = await auditRowsFor('page_draft_saved')
    expect(audits).toHaveLength(1)
    expect(audits[0]).toMatchObject({ resourceType: 'page', resourceId: String(seeded.id), actorId: admin })
  })

  it('returns a real conflict when the client token mismatches (and records no audit)', async () => {
    const admin = await seedAdmin()
    const seeded = await seedPage()
    const revision = await seedRevision(seeded.id, 1)
    const res = await call(
      adminPagesRouter.saveDraft,
      {
        id: String(seeded.id),
        body: emptyLexicalBody(),
        expectedClientRevisionToken: '11111111-1111-4000-8000-000000000000',
      },
      { context: adminCtx(admin) },
    )
    expect(res.status).toBe('conflict')
    expect(res).toMatchObject({ latest: { id: String(revision.id) } })

    expect(await auditRowsFor('page_draft_saved')).toHaveLength(0)
  })
})

describe('adminPagesRouter.publishLatest', () => {
  it('publishes a real revision and records a page_published audit row', async () => {
    const admin = await seedAdmin()
    const seeded = await seedPage()
    const res = await call(
      adminPagesRouter.publishLatest,
      { id: String(seeded.id), body: emptyLexicalBody(), expectedClientRevisionToken: null },
      { context: adminCtx(admin) },
    )
    expect(res.status).toBe('saved')

    const audits = await auditRowsFor('page_published')
    expect(audits).toHaveLength(1)
    expect(audits[0]).toMatchObject({ resourceType: 'page', resourceId: String(seeded.id), actorId: admin })
  })
})

describe('adminPagesRouter.upsertMeta', () => {
  it('creates a real page row when id is omitted', async () => {
    const admin = await seedAdmin()
    const res = await call(
      adminPagesRouter.upsertMeta,
      {
        slug: 'about',
        title: 'About',
        summary: '',
        cover: '',
        og: null,
        published: false,
        commentsEnabled: true,
        showToc: false,
        showUpdated: false,
        showFriends: false,
      },
      { context: adminCtx(admin) },
    )
    expect(res.page.slug).toBe('about')
    expect(res.page.title).toBe('About')

    const rows = await sqliteOf(db).select().from(pageTable).where(eq(pageTable.slug, 'about'))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ title: 'About', published: false, authorId: admin })

    const audits = await auditRowsFor('page_created')
    expect(audits).toHaveLength(1)
    expect(audits[0]).toMatchObject({
      resourceType: 'page',
      resourceId: res.page.id,
      actorId: admin,
    })
  })

  it('updates the seeded row when id is provided', async () => {
    const admin = await seedAdmin()
    const seeded = await seedPage({ slug: 'about', title: 'Old' })

    const res = await call(
      adminPagesRouter.upsertMeta,
      {
        id: String(seeded.id),
        slug: 'about',
        title: 'New',
        summary: 'updated',
        cover: '',
        og: null,
        published: false,
        commentsEnabled: true,
        showToc: true,
        showUpdated: false,
        showFriends: false,
      },
      { context: adminCtx(admin) },
    )
    expect(res.page.id).toBe(String(seeded.id))
    expect(res.page.title).toBe('New')

    const [row] = await sqliteOf(db).select().from(pageTable).where(eq(pageTable.id, seeded.id))
    expect(row).toMatchObject({ slug: 'about', title: 'New', summary: 'updated', showToc: true })

    const audits = await auditRowsFor('page_meta_updated')
    expect(audits).toHaveLength(1)
    expect(audits[0]).toMatchObject({
      resourceType: 'page',
      resourceId: String(seeded.id),
      actorId: admin,
    })
  })
})

describe('adminPagesRouter.listRevisions', () => {
  it('returns the real revision rows for the page', async () => {
    const seeded = await seedPage()
    const rev1 = await seedRevision(seeded.id, 1)
    const rev2 = await seedRevision(seeded.id, 2, 'draft')

    const ctx = makeAuthedCtx({ db })
    const res = await call(adminPagesRouter.listRevisions, { id: String(seeded.id) }, { context: ctx })
    expect(res.revisions).toHaveLength(2)
    expect(res.revisions.map((r) => r.id).sort()).toEqual([String(rev1.id), String(rev2.id)].sort())
  })
})
