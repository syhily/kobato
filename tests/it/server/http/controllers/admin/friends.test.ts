import { call } from '@orpc/server'
import { describe, expect, it, vi } from 'vitest'

import { makeAuthedCtx } from '#/_helpers/mock-ctx'

vi.mock('@/server/domains/friends/service', () => ({
  deleteAdminFriend: vi.fn(),
  listFriendsForAdmin: vi.fn(),
  upsertAdminFriend: vi.fn(),
}))

const service = await import('@/server/domains/friends/service')
const { adminFriendsRouter } = await import('@/server/http/controllers/admin/friends.controller')

const friend = {
  id: '1',
  website: 'Example',
  description: 'An example site',
  homepage: 'https://example.com',
  poster: 'https://example.com/poster.jpg',
  rssUrl: null,
  visible: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

describe('adminFriendsRouter.list', () => {
  it('returns friends, total and hasMore', async () => {
    vi.mocked(service.listFriendsForAdmin).mockResolvedValueOnce({
      friends: [friend],
      total: 1,
      hasMore: false,
    })
    const ctx = makeAuthedCtx()
    const res = await call(adminFriendsRouter.list, { q: 'example' }, { context: ctx })
    expect(res.friends).toHaveLength(1)
    expect(res.total).toBe(1)
    expect(res.hasMore).toBe(false)
  })

  it('forwards the visible filter (pending bucket) to the service', async () => {
    vi.mocked(service.listFriendsForAdmin).mockResolvedValueOnce({
      friends: [],
      total: 0,
      hasMore: false,
    })
    const ctx = makeAuthedCtx()
    await call(adminFriendsRouter.list, { visible: false }, { context: ctx })
    expect(service.listFriendsForAdmin).toHaveBeenCalledWith(expect.anything(), {
      q: undefined,
      // The domain schema defaults `includeHidden` at the wire boundary.
      includeHidden: false,
      visible: false,
      offset: undefined,
      limit: undefined,
    })
  })
})

describe('adminFriendsRouter.upsert', () => {
  it('returns the upserted friend', async () => {
    vi.mocked(service.upsertAdminFriend).mockResolvedValueOnce(friend)
    const ctx = makeAuthedCtx()
    const res = await call(
      adminFriendsRouter.upsert,
      {
        website: 'Example',
        homepage: 'https://example.com',
        poster: 'https://example.com/poster.jpg',
      },
      { context: ctx },
    )
    expect(res.friend.id).toBe('1')
  })
})

describe('adminFriendsRouter.delete', () => {
  it('resolves to undefined on success', async () => {
    vi.mocked(service.deleteAdminFriend).mockResolvedValueOnce(true)
    const ctx = makeAuthedCtx()
    const res = await call(adminFriendsRouter.delete, { id: '1' }, { context: ctx })
    expect(res).toBeUndefined()
  })

  it('throws NOT_FOUND when service returns false', async () => {
    vi.mocked(service.deleteAdminFriend).mockResolvedValueOnce(false)
    const ctx = makeAuthedCtx()
    await expect(call(adminFriendsRouter.delete, { id: '999' }, { context: ctx })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })
})
