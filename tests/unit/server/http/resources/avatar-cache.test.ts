import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AvatarStatus } from '@/server/http/resources/avatar-cache'

describe('avatar-cache helpers', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  async function importModule() {
    return import('@/server/http/resources/avatar-cache')
  }

  it('loads a cached avatar', async () => {
    vi.doMock('@/server/infra/redis/inflight', () => ({
      createInflight: vi.fn(() => vi.fn((_email, fn) => fn())),
    }))
    vi.doMock('@/server/infra/redis/storage', () => ({
      storage: {
        getItemRaw: vi
          .fn()
          .mockResolvedValue(Buffer.concat([Buffer.from([AvatarStatus.HAVE_AVATAR]), Buffer.from('avatar-bytes')])),
      },
    }))
    vi.doMock('@/shared/config/getters', () => ({
      getCacheSettings: vi.fn().mockReturnValue({
        cache: { avatar: { prefix: 'avatar:', ttlSeconds: 3600 } },
      }),
    }))

    const { loadAvatar } = await importModule()
    const avatar = await loadAvatar('a@example.com')
    expect(avatar).not.toBeNull()
    expect(avatar!.status).toBe(AvatarStatus.HAVE_AVATAR)
    expect(avatar!.buffer?.toString()).toBe('avatar-bytes')
  })

  it('returns null for missing cache entry', async () => {
    vi.doMock('@/server/infra/redis/inflight', () => ({
      createInflight: vi.fn(() => vi.fn((_email, fn) => fn())),
    }))
    vi.doMock('@/server/infra/redis/storage', () => ({
      storage: {
        getItemRaw: vi.fn().mockResolvedValue(null),
      },
    }))
    vi.doMock('@/shared/config/getters', () => ({
      getCacheSettings: vi.fn().mockReturnValue({
        cache: { avatar: { prefix: 'avatar:', ttlSeconds: 3600 } },
      }),
    }))

    const { loadAvatar } = await importModule()
    expect(await loadAvatar('missing@example.com')).toBeNull()
  })

  it('caches a HAVE_AVATAR entry', async () => {
    const setItemRaw = vi.fn().mockResolvedValue(undefined)
    vi.doMock('@/server/infra/redis/inflight', () => ({
      createInflight: vi.fn(),
    }))
    vi.doMock('@/server/infra/redis/storage', () => ({ storage: { setItemRaw } }))
    vi.doMock('@/shared/config/getters', () => ({
      getCacheSettings: vi.fn().mockReturnValue({
        cache: { avatar: { prefix: 'avatar:', ttlSeconds: 3600 } },
      }),
    }))

    const { cacheAvatar } = await importModule()
    await cacheAvatar({ email: 'a@example.com', status: AvatarStatus.HAVE_AVATAR, buffer: Buffer.from('png') })

    expect(setItemRaw).toHaveBeenCalledWith(
      'avatar:a@example.com',
      Buffer.concat([Buffer.from([AvatarStatus.HAVE_AVATAR]), Buffer.from('png')]),
      { ttl: 3600 },
    )
  })

  it('caches a NO_AVATAR entry as a single sentinel byte', async () => {
    const setItemRaw = vi.fn().mockResolvedValue(undefined)
    vi.doMock('@/server/infra/redis/inflight', () => ({
      createInflight: vi.fn(),
    }))
    vi.doMock('@/server/infra/redis/storage', () => ({ storage: { setItemRaw } }))
    vi.doMock('@/shared/config/getters', () => ({
      getCacheSettings: vi.fn().mockReturnValue({
        cache: { avatar: { prefix: 'avatar:', ttlSeconds: 3600 } },
      }),
    }))

    const { cacheAvatar } = await importModule()
    await cacheAvatar({ email: 'a@example.com', status: AvatarStatus.NO_AVATAR })

    expect(setItemRaw).toHaveBeenCalledWith('avatar:a@example.com', Buffer.from([AvatarStatus.NO_AVATAR]), {
      ttl: 3600,
    })
  })
})
