import { call } from '@orpc/server'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { makeAuthedCtx } from '#/_helpers/mock-ctx'
import { getDatabaseHandle } from '@/server/bootstrap/db-lifecycle'
import { flushAuditLog } from '@/server/domains/audit/services/batcher'
import { adminRendersRouter } from '@/server/http/controllers/admin/renders.controller'
import { initAllBatchers, resetAllBatchers } from '@/server/infra/db/batcher-registry'
import { auditLog } from '@/server/infra/db/schema/config'
import { content, postSearchIndex } from '@/server/infra/db/schema/content'
import { post } from '@/server/infra/db/schema/post'
import { user } from '@/server/infra/db/schema/user'

// adminRendersRouter against the real engine: KaTeX renders for real
// (mhchem side-effect included via KATEX_OPTIONS' module), and
// reindexSearchBatch walks real post/content rows and writes the real
// post_search_index table — the old mock only echoed fake stats and
// never exercised the batch/offset math.
const db = getTestDb()

let seq = 0

async function seedAdmin(): Promise<number> {
  const [row] = await db
    .insert(user)
    .values({ name: 'Admin', email: `admin-${++seq}@example.com`, password: 'hashed', role: 'admin' })
    .returning({ id: user.id })
  return row.id
}

function adminCtx(userId: number) {
  return makeAuthedCtx({ userId: String(userId), role: 'admin', db })
}

// A live post (published, not deleted, published revision attached) whose
// revision body is a valid portable-text document mentioning `plainText`.
async function seedPublishedPost(plainText: string): Promise<number> {
  const key = ++seq
  const [meta] = await db
    .insert(post)
    .values({ slug: `post-${key}`, title: `Post ${key}`, summary: `Summary ${key}` })
    .returning({ id: post.id })
  const [rev] = await db
    .insert(content)
    .values({
      type: 'post',
      ownerId: meta.id,
      revisionNo: 1,
      status: 'published',
      body: [{ _type: 'block', _key: `b${key}`, children: [{ _type: 'span', _key: `s${key}`, text: plainText }] }],
    })
    .returning({ id: content.id })
  await db.update(post).set({ publishedRevisionId: rev.id }).where(eq(post.id, meta.id))
  return meta.id
}

beforeEach(async () => {
  await clearAllTables(db)
  initAllBatchers(getDatabaseHandle())
})

afterEach(async () => {
  await flushAuditLog()
  resetAllBatchers()
})

describe('adminRendersRouter.math', () => {
  it('returns empty mathml for empty tex', async () => {
    const ctx = makeAuthedCtx({ db })
    const res = await call(adminRendersRouter.math, { tex: '' }, { context: ctx })
    expect(res.mathml).toBe('')
    expect(res.error).toBeNull()
  })

  it('returns real rendered mathml for valid tex', async () => {
    const ctx = makeAuthedCtx({ db })
    const res = await call(adminRendersRouter.math, { tex: '\\frac{1}{2}' }, { context: ctx })
    expect(res.error).toBeNull()
    expect(res.mathml).toContain('<math')
  })

  it('returns the KaTeX error instead of throwing for invalid tex', async () => {
    const ctx = makeAuthedCtx({ db })
    const res = await call(adminRendersRouter.math, { tex: '\\frac{1' }, { context: ctx })
    expect(res.mathml).toBe('')
    expect(typeof res.error).toBe('string')
    expect(res.error!.length).toBeGreaterThan(0)
  })
})

describe('adminRendersRouter.reindexSearch', () => {
  it('rebuilds post_search_index in real batches and reports the offset math', async () => {
    const admin = await seedAdmin()
    const first = await seedPublishedPost('Alpha body text')
    const second = await seedPublishedPost('Beta body text')

    const page1 = await call(
      adminRendersRouter.reindexSearch,
      { offset: 0, batchSize: 1 },
      { context: adminCtx(admin) },
    )
    expect(page1).toEqual({ processed: 1, failed: 0, total: 2, nextOffset: 1 })

    const page2 = await call(
      adminRendersRouter.reindexSearch,
      { offset: 1, batchSize: 1 },
      { context: adminCtx(admin) },
    )
    expect(page2).toEqual({ processed: 1, failed: 0, total: 2, nextOffset: null })

    const rows = await db.select().from(postSearchIndex)
    expect(rows).toHaveLength(2)
    const byPostId = new Map(rows.map((row) => [row.postId, row.plainText]))
    expect(byPostId.get(first)).toContain('Alpha body text')
    expect(byPostId.get(second)).toContain('Beta body text')

    // Each call records a real audit row (flushed from the batcher).
    await flushAuditLog()
    const auditRows = await db.select().from(auditLog).where(eq(auditLog.action, 'search_reindexed'))
    expect(auditRows).toHaveLength(2)
  })
})
