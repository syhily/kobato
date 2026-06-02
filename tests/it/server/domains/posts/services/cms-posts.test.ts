import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'

import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { clearAllTables } from '#/_helpers/integration-db'
import { createDbPool, closePool } from '@/server/infra/db/pool'
import { post as postMetaTable } from '@/server/infra/db/schema/post'

const service = await import('@/server/domains/posts/services/mutate')

const poolManager = createDbPool()
const db: NodePgDatabase = poolManager.db
const pool: Pool = poolManager.pool

afterAll(async () => {
  await closePool(pool)
})

beforeEach(async () => {
  await clearAllTables(db)
})

describe('cms/posts/service — createPost published guard', () => {
  it('always creates with published=false even when input says true', async () => {
    const dto = await service.createPost(db, { title: 'Test', published: true }, null)

    expect(dto.published).toBe(false)

    const rows = await db.select().from(postMetaTable).where(eq(postMetaTable.slug, 'test'))
    expect(rows[0]?.published).toBe(false)
  })

  it('creates with published=false when input omits the field', async () => {
    const dto = await service.createPost(db, { title: 'Test' }, null)

    expect(dto.published).toBe(false)

    const rows = await db.select().from(postMetaTable).where(eq(postMetaTable.slug, 'test'))
    expect(rows[0]?.published).toBe(false)
  })
})

describe('cms/posts/service — updatePostMeta ignores published', () => {
  it('leaves existing published=true untouched even when input says false', async () => {
    const created = await service.createPost(db, { title: 'Hello World', slug: 'hello-world' }, null)
    // Manually set published=true in DB to simulate a published post
    await db
      .update(postMetaTable)
      .set({ published: true })
      .where(eq(postMetaTable.id, BigInt(created.id)))

    const dto = await service.updatePostMeta(db, {
      id: BigInt(created.id),
      slug: 'hello-world',
      title: 'Updated',
      published: false,
    })
    expect(dto.title).toBe('Updated')

    const rows = await db
      .select()
      .from(postMetaTable)
      .where(eq(postMetaTable.id, BigInt(created.id)))
    expect(rows[0]?.published).toBe(true)
  })

  it('leaves existing published=false untouched even when input says true', async () => {
    const created = await service.createPost(db, { title: 'Hello World', slug: 'hello-world' }, null)

    const dto = await service.updatePostMeta(db, {
      id: BigInt(created.id),
      slug: 'hello-world',
      title: 'Updated',
      published: true,
    })
    expect(dto.title).toBe('Updated')

    const rows = await db
      .select()
      .from(postMetaTable)
      .where(eq(postMetaTable.id, BigInt(created.id)))
    expect(rows[0]?.published).toBe(false)
  })
})
