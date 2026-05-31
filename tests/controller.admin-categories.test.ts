import { call } from '@orpc/server'
import { describe, expect, it, vi } from 'vitest'

import { makeAuthedCtx } from './_helpers/mock-ctx'

vi.mock('@/server/domains/taxonomies/categories/service', () => ({
  deleteAdminCategory: vi.fn(),
  listCategoriesForAdmin: vi.fn(),
  reorderAdminCategories: vi.fn(),
  upsertAdminCategory: vi.fn(),
}))

const service = await import('@/server/domains/taxonomies/categories/service')
const { adminCategoriesRouter } = await import('@/server/http/controllers/admin/categories.controller')

const category = {
  id: '1',
  name: 'Tech',
  slug: 'tech',
  cover: 'https://example.com/cover.jpg',
  og: null,
  description: 'Tech posts',
  sortOrder: 0,
  postCount: 5,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

describe('adminCategoriesRouter.list', () => {
  it('returns categories and total', async () => {
    vi.mocked(service.listCategoriesForAdmin).mockResolvedValueOnce({
      categories: [category],
      total: 1,
    })
    const ctx = makeAuthedCtx()
    const res = await call(adminCategoriesRouter.list, { q: 'tech' }, { context: ctx })
    expect(res.categories).toHaveLength(1)
    expect(res.total).toBe(1)
  })

  it('works with empty input', async () => {
    vi.mocked(service.listCategoriesForAdmin).mockResolvedValueOnce({
      categories: [],
      total: 0,
    })
    const ctx = makeAuthedCtx()
    const res = await call(adminCategoriesRouter.list, {}, { context: ctx })
    expect(res.categories).toHaveLength(0)
    expect(res.total).toBe(0)
  })
})

describe('adminCategoriesRouter.upsert', () => {
  it('returns the upserted category', async () => {
    vi.mocked(service.upsertAdminCategory).mockResolvedValueOnce(category)
    const ctx = makeAuthedCtx()
    const res = await call(
      adminCategoriesRouter.upsert,
      { name: 'Tech', cover: 'https://example.com/cover.jpg' },
      { context: ctx },
    )
    expect(res.category.id).toBe('1')
  })
})

describe('adminCategoriesRouter.delete', () => {
  it('resolves to undefined on success', async () => {
    vi.mocked(service.deleteAdminCategory).mockResolvedValueOnce(true)
    const ctx = makeAuthedCtx()
    const res = await call(adminCategoriesRouter.delete, { id: '1' }, { context: ctx })
    expect(res).toBeUndefined()
  })

  it('throws NOT_FOUND when service returns false', async () => {
    vi.mocked(service.deleteAdminCategory).mockResolvedValueOnce(false)
    const ctx = makeAuthedCtx()
    await expect(call(adminCategoriesRouter.delete, { id: '999' }, { context: ctx })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })
})

describe('adminCategoriesRouter.reorder', () => {
  it('returns reordered categories', async () => {
    vi.mocked(service.reorderAdminCategories).mockResolvedValueOnce([category])
    const ctx = makeAuthedCtx()
    const res = await call(adminCategoriesRouter.reorder, { orderedIds: ['1', '2'] }, { context: ctx })
    expect(res.categories).toHaveLength(1)
  })
})
