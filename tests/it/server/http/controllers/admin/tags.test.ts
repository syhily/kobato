import { call } from '@orpc/server'
import { describe, expect, it, vi } from 'vitest'

import { makeAuthedCtx } from '#/_helpers/mock-ctx'

vi.mock('@/server/domains/taxonomies/tags/service', () => ({
  listTagsForAdmin: vi.fn(),
  upsertAdminTag: vi.fn(),
  deleteAdminTag: vi.fn(),
}))

const service = await import('@/server/domains/taxonomies/tags/service')
const { adminTagsRouter } = await import('@/server/http/controllers/admin/tags.controller')

describe('adminTagsRouter.list', () => {
  it('returns tags, total, and hasMore from the service', async () => {
    vi.mocked(service.listTagsForAdmin).mockResolvedValueOnce({
      tags: [
        {
          id: '1',
          name: 'Tag A',
          slug: 'tag-a',
          ogImage: '',
          postCount: 5,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      total: 1,
      hasMore: false,
    })
    const ctx = makeAuthedCtx()
    const res = (await call(adminTagsRouter.list, { q: 'test', offset: 0, limit: 20 }, { context: ctx })) as {
      tags: unknown[]
      total: number
      hasMore: boolean
    }
    expect(res.total).toBe(1)
    expect(res.hasMore).toBe(false)
    expect(res.tags).toHaveLength(1)
  })
})

describe('adminTagsRouter.upsert', () => {
  it('returns the upserted tag on success', async () => {
    const tag = {
      id: '2',
      name: 'Tag B',
      slug: 'tag-b',
      ogImage: '',
      postCount: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    vi.mocked(service.upsertAdminTag).mockResolvedValueOnce(tag)
    const ctx = makeAuthedCtx()
    const res = (await call(adminTagsRouter.upsert, { name: 'Tag B' }, { context: ctx })) as {
      tag: unknown
    }
    expect(res.tag).toEqual(tag)
  })
})

describe('adminTagsRouter.delete', () => {
  it('throws NOT_FOUND when deleteAdminTag returns false', async () => {
    vi.mocked(service.deleteAdminTag).mockResolvedValueOnce(false)
    const ctx = makeAuthedCtx()
    await expect(call(adminTagsRouter.delete, { id: '1' }, { context: ctx })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })

  it('resolves to undefined when deleteAdminTag succeeds', async () => {
    vi.mocked(service.deleteAdminTag).mockResolvedValueOnce(true)
    const ctx = makeAuthedCtx()
    const res = await call(adminTagsRouter.delete, { id: '1' }, { context: ctx })
    expect(res).toBeUndefined()
  })
})
