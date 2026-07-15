import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearAllTables } from '#/_helpers/integration-db'
import { createDbPool, closePool } from '@/server/infra/db/pool'
import { post } from '@/server/infra/db/schema/post'
import { category } from '@/server/infra/db/schema/taxonomy'

vi.mock('@/server/domains/images/services/enhance', () => ({
  hydrateImageRefs: vi.fn(async () => undefined),
}))

const poolManager = createDbPool()
const db: NodePgDatabase = poolManager.db
const pool: Pool = poolManager.pool

afterAll(async () => {
  await closePool(pool)
})

beforeEach(async () => {
  await clearAllTables(db)
})

describe('listCategoriesForAdmin', () => {
  it('counts published posts per category regardless of visibility or scheduled date', async () => {
    await db.insert(category).values([
      { name: 'Tech', slug: 'tech', cover: '', description: '', sortOrder: 0 },
      { name: 'Life', slug: 'life', cover: '', description: '', sortOrder: 1 },
    ])

    const future = new Date(Date.now() + 24 * 60 * 60 * 1000)
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000)

    await db.insert(post).values([
      // counted: visible, published, past
      {
        slug: 'tech-visible',
        title: 'Tech Visible',
        summary: '',
        cover: '',
        category: 'Tech',
        visible: true,
        published: true,
        publishedAt: past,
        publishedRevisionId: 1n,
      },
      // counted: hidden but includeHidden=true
      {
        slug: 'tech-hidden',
        title: 'Tech Hidden',
        summary: '',
        cover: '',
        category: 'Tech',
        visible: false,
        published: true,
        publishedAt: past,
        publishedRevisionId: 2n,
      },
      // counted: future-dated but includeScheduled=true
      {
        slug: 'tech-future',
        title: 'Tech Future',
        summary: '',
        cover: '',
        category: 'Tech',
        visible: true,
        published: true,
        publishedAt: future,
        publishedRevisionId: 3n,
      },
      // not counted: published but no published revision (a draft state)
      {
        slug: 'tech-norev',
        title: 'Tech NoRev',
        summary: '',
        cover: '',
        category: 'Tech',
        visible: true,
        published: true,
        publishedAt: past,
      },
      // not counted: draft
      {
        slug: 'tech-draft',
        title: 'Tech Draft',
        summary: '',
        cover: '',
        category: 'Tech',
        visible: true,
        published: false,
        publishedAt: past,
      },
      // not counted: deleted
      {
        slug: 'tech-deleted',
        title: 'Tech Deleted',
        summary: '',
        cover: '',
        category: 'Tech',
        visible: true,
        published: true,
        publishedAt: past,
        deletedAt: new Date(),
      },
      // counted: different category
      {
        slug: 'life-post',
        title: 'Life Post',
        summary: '',
        cover: '',
        category: 'Life',
        visible: true,
        published: true,
        publishedAt: past,
        publishedRevisionId: 4n,
      },
      // not counted: no category
      {
        slug: 'uncategorized',
        title: 'Uncategorized',
        summary: '',
        cover: '',
        category: '',
        visible: true,
        published: true,
        publishedAt: past,
        publishedRevisionId: 5n,
      },
    ])

    const { listCategoriesForAdmin } = await import('@/server/domains/taxonomies/categories/services/query')
    const result = await listCategoriesForAdmin(db, {})

    expect(result.total).toBe(2)
    const tech = result.categories.find((c) => c.name === 'Tech')
    const life = result.categories.find((c) => c.name === 'Life')
    expect(tech?.postCount).toBe(3)
    expect(life?.postCount).toBe(1)
  })

  it('returns zero counts when no posts match', async () => {
    await db.insert(category).values([{ name: 'Empty', slug: 'empty', cover: '', description: '', sortOrder: 0 }])

    const { listCategoriesForAdmin } = await import('@/server/domains/taxonomies/categories/services/query')
    const result = await listCategoriesForAdmin(db, {})

    expect(result.total).toBe(1)
    expect(result.categories[0]?.postCount).toBe(0)
  })
})
