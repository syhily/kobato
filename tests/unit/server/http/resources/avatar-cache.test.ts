import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/server/infra/cache/registry', () => ({
  get: vi.fn(),
  set: vi.fn(),
}))

import { AvatarStatus, cacheAvatar, loadAvatar } from '@/server/http/resources/avatar-cache'
import { get, set } from '@/server/infra/cache/registry'

const getMock = vi.mocked(get)
const setMock = vi.mocked(set)

// The db handle is only forwarded to the mocked cache module — a stand-in
// is enough for the unit scope. (The byte-level sentinel codec itself is
// covered by the registry module's own unit tests.)
const db = {} as NodePgDatabase

describe('avatar-cache helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads a cached avatar through the avatar declaration', async () => {
    getMock.mockResolvedValue({ status: AvatarStatus.HAVE_AVATAR, buffer: Buffer.from('avatar-bytes') })

    const avatar = await loadAvatar(db, 'a@example.com', 120)

    expect(avatar).not.toBeNull()
    expect(avatar!.status).toBe(AvatarStatus.HAVE_AVATAR)
    expect(avatar!.buffer?.toString()).toBe('avatar-bytes')
    expect(getMock).toHaveBeenCalledWith(db, 'avatar', { size: 120, email: 'a@example.com' })
  })

  it('reads the entry under the requested size', async () => {
    getMock.mockResolvedValue(null)

    expect(await loadAvatar(db, 'missing@example.com', 512)).toBeNull()
    expect(getMock).toHaveBeenCalledWith(db, 'avatar', { size: 512, email: 'missing@example.com' })
  })

  it('caches a HAVE_AVATAR entry', async () => {
    setMock.mockResolvedValue(undefined)

    await cacheAvatar(db, {
      email: 'a@example.com',
      size: 80,
      status: AvatarStatus.HAVE_AVATAR,
      buffer: Buffer.from('png'),
    })

    expect(setMock).toHaveBeenCalledWith(
      db,
      'avatar',
      { size: 80, email: 'a@example.com' },
      { status: AvatarStatus.HAVE_AVATAR, buffer: Buffer.from('png') },
    )
  })

  it('caches a NO_AVATAR entry with a null buffer', async () => {
    setMock.mockResolvedValue(undefined)

    await cacheAvatar(db, { email: 'a@example.com', size: 80, status: AvatarStatus.NO_AVATAR })

    expect(setMock).toHaveBeenCalledWith(
      db,
      'avatar',
      { size: 80, email: 'a@example.com' },
      { status: AvatarStatus.NO_AVATAR, buffer: null },
    )
  })
})
