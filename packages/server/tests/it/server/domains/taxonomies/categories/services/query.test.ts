import { category } from '@kobato/db/schema/taxonomy.ts'
import {
  findCategoryBySlug,
  resolveCategoryBySlugOrName,
} from '@kobato/server/domains/taxonomies/categories/services/query.ts'
import { clearAllTables, getTestDb } from '@kobato/server/tests/utils/integration-db.ts'
import { beforeEach, describe, expect, it } from 'vitest'

const db = getTestDb()

beforeEach(async () => {
  await clearAllTables(db)
})

async function seedCategory(name: string, slug: string): Promise<typeof category.$inferSelect> {
  const rows = await db.insert(category).values({ name, slug, cover: '', description: '', sortOrder: 0 }).returning()
  return rows[0]!
}

describe('server/domains/taxonomies/categories/services/query — findCategoryBySlug', () => {
  it('returns the row when present', async () => {
    const seeded = await seedCategory('技术', 'tech')

    const row = await findCategoryBySlug(db, 'tech')

    expect(row?.id).toBe(seeded.id)
    expect(row?.name).toBe('技术')
    expect(row?.slug).toBe('tech')
  })

  it('returns null when absent', async () => {
    await seedCategory('技术', 'tech')

    await expect(findCategoryBySlug(db, 'life')).resolves.toBeNull()
  })
})

describe('server/domains/taxonomies/categories/services/query — resolveCategoryBySlugOrName', () => {
  it('prefers the slug hit over a name hit on another row', async () => {
    const bySlug = await seedCategory('技术', 'tech')
    await seedCategory('tech', 'tech-as-name')

    const row = await resolveCategoryBySlugOrName(db, 'tech')

    expect(row?.id).toBe(bySlug.id)
    expect(row?.slug).toBe('tech')
  })

  it('falls back to the name lookup when the slug misses', async () => {
    const seeded = await seedCategory('技术', 'tech')

    const row = await resolveCategoryBySlugOrName(db, '技术')

    expect(row?.id).toBe(seeded.id)
    expect(row?.name).toBe('技术')
  })

  it('returns null when both slug and name miss', async () => {
    await seedCategory('技术', 'tech')

    await expect(resolveCategoryBySlugOrName(db, 'missing')).resolves.toBeNull()
  })
})
