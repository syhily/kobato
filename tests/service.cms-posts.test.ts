import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { db } from '@/server/infra/db/pool'
import { post as postMetaTable } from '@/server/infra/db/schema'

import { clearAllTables } from './_helpers/integration-db'

const service = await import('@/server/domains/posts/services/mutate')

beforeEach(async () => {
  await clearAllTables(db)
})

describe('cms/posts/service — createPost published guard', () => {
  it('always creates with published=false even when input says true', async () => {
    const dto = await service.createPost({ title: 'Test', published: true }, null)

    expect(dto.published).toBe(false)

    const rows = await db.select().from(postMetaTable).where(eq(postMetaTable.slug, 'test'))
    expect(rows[0]?.published).toBe(false)
  })

  it('creates with published=false when input omits the field', async () => {
    const dto = await service.createPost({ title: 'Test' }, null)

    expect(dto.published).toBe(false)

    const rows = await db.select().from(postMetaTable).where(eq(postMetaTable.slug, 'test'))
    expect(rows[0]?.published).toBe(false)
  })
})

describe('cms/posts/service — updatePostMeta ignores published', () => {
  it('leaves existing published=true untouched even when input says false', async () => {
    const created = await service.createPost({ title: 'Hello World', slug: 'hello-world' }, null)
    // Manually set published=true in DB to simulate a published post
    await db
      .update(postMetaTable)
      .set({ published: true })
      .where(eq(postMetaTable.id, BigInt(created.id)))

    const dto = await service.updatePostMeta({
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
    const created = await service.createPost({ title: 'Hello World', slug: 'hello-world' }, null)

    const dto = await service.updatePostMeta({
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
