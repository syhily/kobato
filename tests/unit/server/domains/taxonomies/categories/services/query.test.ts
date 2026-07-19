import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findCategoryBySlug: vi.fn(),
  findCategoryByName: vi.fn(),
}))

vi.mock('@/server/infra/db/operations/category', () => ({
  findCategoryBySlug: mocks.findCategoryBySlug,
  findCategoryByName: mocks.findCategoryByName,
}))

import type { CategoryRow } from '@/server/infra/db/types'

import { resolveCategoryBySlugOrName } from '@/server/domains/taxonomies/categories/services/query'

const db = {} as NodePgDatabase

beforeEach(() => {
  vi.clearAllMocks()
})

describe('server/domains/taxonomies/categories/services/query — resolveCategoryBySlugOrName', () => {
  it('returns the row on a slug hit without consulting the name lookup', async () => {
    const row = { id: 1n, name: '技术', slug: 'tech' } as CategoryRow
    mocks.findCategoryBySlug.mockResolvedValue(row)

    await expect(resolveCategoryBySlugOrName(db, 'tech')).resolves.toBe(row)
    expect(mocks.findCategoryByName).not.toHaveBeenCalled()
  })

  it('falls back to the name lookup when the slug misses', async () => {
    const row = { id: 1n, name: '技术', slug: 'tech' } as CategoryRow
    mocks.findCategoryBySlug.mockResolvedValue(null)
    mocks.findCategoryByName.mockResolvedValue(row)

    await expect(resolveCategoryBySlugOrName(db, '技术')).resolves.toBe(row)
  })

  it('returns null when both slug and name miss', async () => {
    mocks.findCategoryBySlug.mockResolvedValue(null)
    mocks.findCategoryByName.mockResolvedValue(null)

    await expect(resolveCategoryBySlugOrName(db, 'missing')).resolves.toBeNull()
  })
})
