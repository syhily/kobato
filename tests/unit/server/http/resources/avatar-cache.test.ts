import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AvatarStatus } from '@/server/http/resources/avatar-cache'

// The db handle is only forwarded to the mocked kv-store — a stand-in is
// enough for the unit scope.
const db = {} as NodePgDatabase

describe('avatar-cache helpers', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  async function importModule() {
    return import('@/server/http/resources/avatar-cache')
  }

  it('loads a cached avatar', async () => {
    vi.doMock('@/server/infra/cache/inflight', () => ({
      createInflight: vi.fn(() => vi.fn((_email, fn) => fn())),
    }))
    vi.doMock('@/server/infra/cache/kv-store', () => ({
      getItemRaw: vi
        .fn()
        .mockResolvedValue(Buffer.concat([Buffer.from([AvatarStatus.HAVE_AVATAR]), Buffer.from('avatar-bytes')])),
    }))
    vi.doMock('@/shared/config/getters', () => ({
      getCacheSettings: vi.fn().mockReturnValue({
        cache: { avatar: { prefix: 'avatar:', ttlSeconds: 3600 } },
      }),
    }))

    const { loadAvatar } = await importModule()
    const avatar = await loadAvatar(db, 'a@example.com', 120)
    expect(avatar).not.toBeNull()
    expect(avatar!.status).toBe(AvatarStatus.HAVE_AVATAR)
    expect(avatar!.buffer?.toString()).toBe('avatar-bytes')
  })

  it('reads the entry under the requested size', async () => {
    const getItemRaw = vi.fn().mockResolvedValue(null)
    vi.doMock('@/server/infra/cache/inflight', () => ({
      createInflight: vi.fn(() => vi.fn((_email, fn) => fn())),
    }))
    vi.doMock('@/server/infra/cache/kv-store', () => ({ getItemRaw }))
    vi.doMock('@/shared/config/getters', () => ({
      getCacheSettings: vi.fn().mockReturnValue({
        cache: { avatar: { prefix: 'avatar:', ttlSeconds: 3600 } },
      }),
    }))

    const { loadAvatar } = await importModule()
    expect(await loadAvatar(db, 'missing@example.com', 512)).toBeNull()
    expect(getItemRaw).toHaveBeenCalledWith(db, 'avatar:512:missing@example.com')
  })

  it('caches a HAVE_AVATAR entry', async () => {
    const setItemRaw = vi.fn().mockResolvedValue(undefined)
    vi.doMock('@/server/infra/cache/inflight', () => ({
      createInflight: vi.fn(),
    }))
    vi.doMock('@/server/infra/cache/kv-store', () => ({ setItemRaw }))
    vi.doMock('@/shared/config/getters', () => ({
      getCacheSettings: vi.fn().mockReturnValue({
        cache: { avatar: { prefix: 'avatar:', ttlSeconds: 3600 } },
      }),
    }))

    const { cacheAvatar } = await importModule()
    await cacheAvatar(db, {
      email: 'a@example.com',
      size: 80,
      status: AvatarStatus.HAVE_AVATAR,
      buffer: Buffer.from('png'),
    })

    expect(setItemRaw).toHaveBeenCalledWith(
      db,
      'avatar:80:a@example.com',
      Buffer.concat([Buffer.from([AvatarStatus.HAVE_AVATAR]), Buffer.from('png')]),
      { ttlSeconds: 3600, bucket: 'avatar' },
    )
  })

  it('caches a NO_AVATAR entry as a single sentinel byte', async () => {
    const setItemRaw = vi.fn().mockResolvedValue(undefined)
    vi.doMock('@/server/infra/cache/inflight', () => ({
      createInflight: vi.fn(),
    }))
    vi.doMock('@/server/infra/cache/kv-store', () => ({ setItemRaw }))
    vi.doMock('@/shared/config/getters', () => ({
      getCacheSettings: vi.fn().mockReturnValue({
        cache: { avatar: { prefix: 'avatar:', ttlSeconds: 3600 } },
      }),
    }))

    const { cacheAvatar } = await importModule()
    await cacheAvatar(db, { email: 'a@example.com', size: 80, status: AvatarStatus.NO_AVATAR })

    expect(setItemRaw).toHaveBeenCalledWith(db, 'avatar:80:a@example.com', Buffer.from([AvatarStatus.NO_AVATAR]), {
      ttlSeconds: 3600,
      bucket: 'avatar',
    })
  })
})
