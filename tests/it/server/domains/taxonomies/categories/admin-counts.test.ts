import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Database } from '@/server/infra/db/database'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { post } from '@/server/infra/db/schema/post'
import { category } from '@/server/infra/db/schema/taxonomy'

vi.mock('@/server/domains/images/services/enhance', () => ({
  hydrateImageRefs: vi.fn(async () => undefined),
}))

const db = getTestDb()

beforeEach(async () => {
  await clearAllTables(db)
})

describe('listCategoriesForAdmin', () => {
  it('counts published posts per category regardless of visibility or scheduled date', async () => {
    const [techRow, lifeRow] = await db
      .insert(category)
      .values([
        { name: 'Tech', slug: 'tech', cover: '', description: '', sortOrder: 0 },
        { name: 'Life', slug: 'life', cover: '', description: '', sortOrder: 1 },
      ])
      .returning()

    const future = new Date(Date.now() + 24 * 60 * 60 * 1000)
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000)

    await db.insert(post).values([
      // counted: visible, published, past
      {
        slug: 'tech-visible',
        title: 'Tech Visible',
        summary: '',
        cover: '',
        categoryId: techRow.id,
        visible: true,
        published: true,
        publishedAt: past,
        publishedRevisionId: 1,
      },
      // counted: hidden but includeHidden=true
      {
        slug: 'tech-hidden',
        title: 'Tech Hidden',
        summary: '',
        cover: '',
        categoryId: techRow.id,
        visible: false,
        published: true,
        publishedAt: past,
        publishedRevisionId: 2,
      },
      // counted: future-dated but includeScheduled=true
      {
        slug: 'tech-future',
        title: 'Tech Future',
        summary: '',
        cover: '',
        categoryId: techRow.id,
        visible: true,
        published: true,
        publishedAt: future,
        publishedRevisionId: 3,
      },
      // not counted: published but no published revision (a draft state)
      {
        slug: 'tech-norev',
        title: 'Tech NoRev',
        summary: '',
        cover: '',
        categoryId: techRow.id,
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
        categoryId: techRow.id,
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
        categoryId: techRow.id,
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
        categoryId: lifeRow.id,
        visible: true,
        published: true,
        publishedAt: past,
        publishedRevisionId: 4,
      },
      // not counted: no category
      {
        slug: 'uncategorized',
        title: 'Uncategorized',
        summary: '',
        cover: '',
        categoryId: null,
        visible: true,
        published: true,
        publishedAt: past,
        publishedRevisionId: 5,
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

  // Regression for the drifted gates: the admin list and the count
  // returned by upsert must come from the same live-gate definition, so
  // a draft + a published post both count as exactly 1 on either path.
  it('list count and upsert-returned count agree (both exclude drafts)', async () => {
    const [cat] = await db
      .insert(category)
      .values({ name: 'Tech', slug: 'tech', cover: '', description: '', sortOrder: 0 })
      .returning()

    const past = new Date(Date.now() - 24 * 60 * 60 * 1000)
    await db.insert(post).values([
      {
        slug: 'tech-published',
        title: 'Tech Published',
        summary: '',
        cover: '',
        categoryId: cat.id,
        visible: true,
        published: true,
        publishedAt: past,
        publishedRevisionId: 1,
      },
      {
        slug: 'tech-draft',
        title: 'Tech Draft',
        summary: '',
        cover: '',
        categoryId: cat.id,
        visible: true,
        published: false,
        publishedAt: past,
      },
    ])

    const { listCategoriesForAdmin } = await import('@/server/domains/taxonomies/categories/services/query')
    const { upsertAdminCategory } = await import('@/server/domains/taxonomies/categories/services/mutate')

    const list = await listCategoriesForAdmin(db, {})
    expect(list.categories.find((c) => c.name === 'Tech')?.postCount).toBe(1)

    const updated = await upsertAdminCategory(db, { id: cat.id, name: 'Tech', cover: '', description: '' })
    expect(updated.postCount).toBe(1)
  })
})
