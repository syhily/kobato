import { asc } from 'drizzle-orm'
import { describe, expect, it, beforeEach } from 'vitest'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { reorderAdminCategories } from '@/server/domains/taxonomies/categories/services/mutate'
import { reorderCategories } from '@/server/infra/db/operations/category'
import { category } from '@/server/infra/db/schema/taxonomy'

const db = getTestDb()

beforeEach(async () => {
  await clearAllTables(db)
})

describe('reorderCategories', () => {
  it('batch-updates sort_order via CASE expression', async () => {
    const inserted = await db
      .insert(category)
      .values([
        { name: 'A', slug: 'a', cover: '', description: '', sortOrder: 0 },
        { name: 'B', slug: 'b', cover: '', description: '', sortOrder: 1 },
        { name: 'C', slug: 'c', cover: '', description: '', sortOrder: 2 },
      ])
      .returning()

    const orderedIds = [inserted[2].id, inserted[0].id, inserted[1].id]
    const result = await reorderCategories(db, orderedIds)

    expect(result).toHaveLength(3)
    expect(result[0].name).toBe('C')
    expect(result[0].sortOrder).toBe(0)
    expect(result[1].name).toBe('A')
    expect(result[1].sortOrder).toBe(1)
    expect(result[2].name).toBe('B')
    expect(result[2].sortOrder).toBe(2)

    const rows = await db.select().from(category).orderBy(asc(category.sortOrder))
    expect(rows.map((r) => r.name)).toEqual(['C', 'A', 'B'])
  })

  it('returns empty array for empty input', async () => {
    const result = await reorderCategories(db, [])
    expect(result).toEqual([])
  })

  it('returns rows in the requested id order', async () => {
    const inserted = await db
      .insert(category)
      .values([
        { name: 'X', slug: 'x', cover: '', description: '', sortOrder: 0 },
        { name: 'Y', slug: 'y', cover: '', description: '', sortOrder: 1 },
      ])
      .returning()

    const result = await reorderCategories(db, [inserted[1].id, inserted[0].id])
    expect(result.map((r) => r.name)).toEqual(['Y', 'X'])
  })
})

describe('reorderAdminCategories', () => {
  it('reorders and returns DTOs with correct post counts', async () => {
    const inserted = await db
      .insert(category)
      .values([
        { name: 'Alpha', slug: 'alpha', cover: '', description: '', sortOrder: 0 },
        { name: 'Beta', slug: 'beta', cover: '', description: '', sortOrder: 1 },
      ])
      .returning()

    const orderedIds = [inserted[1].id, inserted[0].id].map(String)
    const result = await reorderAdminCategories(db, orderedIds)

    expect(result).toHaveLength(2)
    expect(result[0].name).toBe('Beta')
    expect(result[0].sortOrder).toBe(0)
    expect(result[1].name).toBe('Alpha')
    expect(result[1].sortOrder).toBe(1)

    for (const dto of result) {
      expect(typeof dto.id).toBe('string')
      expect(typeof dto.postCount).toBe('number')
      expect(dto.createdAt).toMatch(/^\d{4}-/)
      expect(dto.updatedAt).toMatch(/^\d{4}-/)
    }
  })

  it('rejects duplicate ids', async () => {
    await expect(reorderAdminCategories(db, ['1', '1'])).rejects.toThrow('重复的分类 id')
  })

  it('rejects when id count mismatches live rows', async () => {
    await db.insert(category).values({ name: 'Only', slug: 'only', cover: '', description: '', sortOrder: 0 })
    await expect(reorderAdminCategories(db, ['1', '2'])).rejects.toThrow('不一致')
  })

  it('rejects unknown ids', async () => {
    const inserted = await db
      .insert(category)
      .values({ name: 'Only', slug: 'only', cover: '', description: '', sortOrder: 0 })
      .returning()

    await expect(reorderAdminCategories(db, [String(inserted[0].id), '999999'])).rejects.toThrow('不一致')
  })
})
