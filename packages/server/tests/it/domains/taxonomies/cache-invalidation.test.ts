import { clearAllTables, getTestDb } from '#/_helpers/integration-db'

import { kvCache } from '@kobato/server/infra/db/schema/kv-cache'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

const db = getTestDb()

beforeEach(async () => {
  await clearAllTables(db)
})

async function feedRowCount(): Promise<number> {
  const rows = await db.select({ key: kvCache.key }).from(kvCache).where(eq(kvCache.bucket, 'feed'))
  return rows.length
}

describe('taxonomy cache invalidation', () => {
  it('shows a renamed tag immediately after upsertAdminTag (no TTL wait)', async () => {
    const { upsertAdminTag, listAllTags } = await import('@kobato/server/domains/taxonomies/tags/service')
    const created = await upsertAdminTag(db, { name: 'OldName' })

    // Prime the `tags:all` cache with the pre-rename list.
    const primed = await listAllTags(db)
    expect(primed.map((t) => t.name)).toContain('OldName')

    await upsertAdminTag(db, { id: Number(created.id), name: 'NewName' })

    const after = await listAllTags(db)
    expect(after.map((t) => t.name)).toContain('NewName')
    expect(after.map((t) => t.name)).not.toContain('OldName')
  })

  it('clears the whole feed bucket when a category is renamed', async () => {
    const { upsertAdminCategory } = await import('@kobato/server/domains/taxonomies/categories/services/mutate')
    const { set } = await import('@kobato/server/infra/cache/registry')
    const created = await upsertAdminCategory(db, { name: 'FeedCat', cover: '', description: '' })

    // Warm the feed bucket, including the category-scoped key.
    await set(db, 'feed', { scope: 'all' }, '<xml>all</xml>')
    await set(db, 'feed', { scope: 'cat:feedcat' }, '<xml>cat</xml>')
    expect(await feedRowCount()).toBe(2)

    await upsertAdminCategory(db, { id: Number(created.id), name: 'FeedCatRenamed', cover: '', description: '' })

    expect(await feedRowCount()).toBe(0)
  })

  it('increments a tag count immediately when a post carrying the tag is published', async () => {
    const { listAllTags } = await import('@kobato/server/domains/taxonomies/tags/service')

    // Prime the cache before the tag/post exist.
    const primed = await listAllTags(db)
    expect(primed.find((t) => t.name === 'CacheTag')).toBeUndefined()

    const { createPost } = await import('@kobato/server/domains/posts/services/mutate')
    const created = await createPost(db, { title: 'Cache Post', tags: ['CacheTag'] }, null)
    const { saveBody } = await import('@kobato/server/domains/content/lifecycle')
    const { postLifecycleAdapter } = await import('@kobato/server/domains/posts/services/lifecycle-adapter')
    const r = await saveBody(
      db,
      postLifecycleAdapter,
      {
        entityId: Number(created.id),
        body: [
          {
            _type: 'block',
            _key: 'b1',
            style: 'normal',
            children: [{ _type: 'span', _key: 's1', text: 'pub', marks: [] }],
          },
        ],
        authorId: null,
      },
      'publish',
    )
    expect(r.status).toBe('saved')

    const after = await listAllTags(db)
    expect(after.find((t) => t.name === 'CacheTag')?.counts).toBe(1)
  })
})
