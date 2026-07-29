import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import type { Database } from '@/server/infra/db/database'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { post as postMetaTable } from '@/server/infra/db/schema/post'

const service = await import('@/server/domains/posts/services/mutate')

const db = getTestDb()

beforeEach(async () => {
  await clearAllTables(db)
})

describe('cms/posts/service — createPost published guard', () => {
  it('always creates with status=draft even when input says true', async () => {
    const dto = await service.createPost(db, { title: 'Test', published: true }, null)

    expect(dto.published).toBe(false)

    const rows = await db.select().from(postMetaTable).where(eq(postMetaTable.slug, 'test'))
    expect(rows[0]?.published).toBe(false)
  })

  it('creates with status=draft when input omits the field', async () => {
    const dto = await service.createPost(db, { title: 'Test' }, null)

    expect(dto.published).toBe(false)

    const rows = await db.select().from(postMetaTable).where(eq(postMetaTable.slug, 'test'))
    expect(rows[0]?.published).toBe(false)
  })
})

describe('cms/posts/service — updatePostMeta ignores published', () => {
  it('leaves existing status=published untouched even when input says false', async () => {
    const created = await service.createPost(db, { title: 'Hello World', slug: 'hello-world' }, null)
    // Manually set status=published in DB to simulate a published post
    await db
      .update(postMetaTable)
      .set({ published: true })
      .where(eq(postMetaTable.id, Number(created.id)))

    const dto = await service.updatePostMeta(db, {
      id: Number(created.id),
      slug: 'hello-world',
      title: 'Updated',
      published: false,
    })
    expect(dto.title).toBe('Updated')

    const rows = await db
      .select()
      .from(postMetaTable)
      .where(eq(postMetaTable.id, Number(created.id)))
    expect(rows[0]?.published).toBe(true)
  })

  it('leaves existing status=draft untouched even when input says true', async () => {
    const created = await service.createPost(db, { title: 'Hello World', slug: 'hello-world' }, null)

    const dto = await service.updatePostMeta(db, {
      id: Number(created.id),
      slug: 'hello-world',
      title: 'Updated',
      published: true,
    })
    expect(dto.title).toBe('Updated')

    const rows = await db
      .select()
      .from(postMetaTable)
      .where(eq(postMetaTable.id, Number(created.id)))
    expect(rows[0]?.published).toBe(false)
  })
})
