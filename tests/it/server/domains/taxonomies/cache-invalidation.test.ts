import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearAllTables } from '#/_helpers/integration-db'
import { createDbPool, closePool } from '@/server/infra/db/pool'

vi.mock('@/server/infra/search/openai', () => ({
  generateEmbedding: vi.fn(async () => null),
}))
vi.mock('@/server/domains/images/services/enhance', () => ({
  hydrateImageRefs: vi.fn(async () => undefined),
}))
vi.mock('@/server/infra/cache/feed-cache', () => ({ clearFeedCache: vi.fn(async () => undefined) }))
vi.mock('@/server/infra/cache/sitemap-cache', () => ({ clearSitemapCache: vi.fn(async () => undefined) }))
vi.mock('@/server/infra/search/search', () => ({ invalidateSearchCache: vi.fn(async () => undefined) }))

const poolManager = createDbPool()
const db: NodePgDatabase = poolManager.db
const pool: Pool = poolManager.pool

afterAll(async () => {
  await closePool(pool)
})

beforeEach(async () => {
  await clearAllTables(db)
})

describe('taxonomy cache invalidation', () => {
  it('shows a renamed tag immediately after upsertAdminTag (no TTL wait)', async () => {
    const { upsertAdminTag, listAllTags } = await import('@/server/domains/taxonomies/tags/service')
    const created = await upsertAdminTag(db, { name: 'OldName' })

    // Prime the `tags:all` cache with the pre-rename list.
    const primed = await listAllTags(db)
    expect(primed.map((t) => t.name)).toContain('OldName')

    await upsertAdminTag(db, { id: BigInt(created.id), name: 'NewName' })

    const after = await listAllTags(db)
    expect(after.map((t) => t.name)).toContain('NewName')
    expect(after.map((t) => t.name)).not.toContain('OldName')
  })

  it('increments a tag count immediately when a post carrying the tag is published', async () => {
    const { listAllTags } = await import('@/server/domains/taxonomies/tags/service')

    // Prime the cache before the tag/post exist.
    const primed = await listAllTags(db)
    expect(primed.find((t) => t.name === 'CacheTag')).toBeUndefined()

    const { createPost } = await import('@/server/domains/posts/services/mutate')
    const created = await createPost(db, { title: 'Cache Post', tags: ['CacheTag'] }, null)
    const { saveBody } = await import('@/server/domains/content/lifecycle')
    const { postLifecycleAdapter } = await import('@/server/domains/posts/services/lifecycle-adapter')
    const r = await saveBody(
      db,
      postLifecycleAdapter,
      {
        entityId: BigInt(created.id),
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
