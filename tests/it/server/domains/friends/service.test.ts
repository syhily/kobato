import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearAllTables } from '#/_helpers/integration-db'
import { createDbPool, closePool } from '@/server/infra/db/pool'
import { friend } from '@/server/infra/db/schema/friend'

vi.mock('@/server/domains/images/services/enhance', () => ({
  hydrateImageRefs: vi.fn(async () => undefined),
}))

const poolManager = createDbPool()
const db: NodePgDatabase = poolManager.db
const pool: Pool = poolManager.pool

afterAll(async () => {
  await closePool(pool)
})

beforeEach(async () => {
  await clearAllTables(db)
})

async function seedFriend(opts: Partial<typeof friend.$inferInsert> = {}): Promise<bigint> {
  const rows = await db
    .insert(friend)
    .values({
      website: opts.website ?? 'Site',
      description: opts.description,
      homepage: opts.homepage ?? `https://example.com/${Math.random()}`,
      poster: opts.poster ?? '/p.jpg',
      rssUrl: opts.rssUrl,
      visible: opts.visible ?? true,
    })
    .returning({ id: friend.id })
  return rows[0]!.id
}

describe('friends/service — toPublicFriend', () => {
  it('projects a row to the public DTO', async () => {
    const { toPublicFriend } = await import('@/server/domains/friends/service')
    const dto = toPublicFriend({
      id: 1n,
      createdAt: new Date(),
      updatedAt: new Date(),
      website: 'W',
      description: 'desc',
      homepage: 'https://x.com',
      poster: '/p.png',
      rssUrl: null,
      visible: true,
    })
    expect(dto.website).toBe('W')
    expect(dto.description).toBe('desc')
    expect(dto.homepage).toBe('https://x.com')
    expect(dto.poster).toBe('/p.png')
  })
  it('coerces null description to undefined', async () => {
    const { toPublicFriend } = await import('@/server/domains/friends/service')
    const dto = toPublicFriend({
      id: 1n,
      createdAt: new Date(),
      updatedAt: new Date(),
      website: 'W',
      description: null,
      homepage: 'h',
      poster: 'p',
      rssUrl: null,
      visible: true,
    })
    expect(dto.description).toBeUndefined()
  })
})

describe('friends/service — toAdminFriendDto', () => {
  it('stringifies bigint id and ISO timestamps', async () => {
    const createdAt = new Date('2026-01-01')
    const updatedAt = new Date('2026-02-01')
    const { toAdminFriendDto } = await import('@/server/domains/friends/service')
    const dto = toAdminFriendDto({
      id: 7n,
      createdAt,
      updatedAt,
      website: 'W',
      description: null,
      homepage: 'h',
      poster: 'p',
      rssUrl: 'rss',
      visible: false,
    })
    expect(dto.id).toBe('7')
    expect(dto.createdAt).toBe(createdAt.toISOString())
    expect(dto.updatedAt).toBe(updatedAt.toISOString())
    expect(dto.visible).toBe(false)
    expect(dto.rssUrl).toBe('rss')
  })
})

describe('friends/service — listPublicFriends', () => {
  it('returns only visible friends', async () => {
    await seedFriend({ website: 'A', homepage: 'https://a.com', visible: true })
    await seedFriend({ website: 'B', homepage: 'https://b.com', visible: false })
    const { listPublicFriends } = await import('@/server/domains/friends/service')
    const rows = await listPublicFriends(db)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.website).toBe('A')
  })
  it('returns an empty list when there are no visible friends', async () => {
    const { listPublicFriends } = await import('@/server/domains/friends/service')
    expect(await listPublicFriends(db)).toEqual([])
  })
})

describe('friends/service — listFriendsForAdmin', () => {
  it('paginates and returns total + hasMore', async () => {
    await seedFriend({ website: 'A', homepage: 'https://a.com' })
    await seedFriend({ website: 'B', homepage: 'https://b.com' })
    await seedFriend({ website: 'C', homepage: 'https://c.com' })
    const { listFriendsForAdmin } = await import('@/server/domains/friends/service')
    const r = await listFriendsForAdmin(db, { offset: 0, limit: 2 })
    expect(r.friends).toHaveLength(2)
    expect(r.total).toBe(3)
    expect(r.hasMore).toBe(true)
  })
  it('matches by q against website/description/homepage', async () => {
    await seedFriend({ website: 'Hello', homepage: 'https://h.com', description: 'desc' })
    await seedFriend({ website: 'World', homepage: 'https://w.com' })
    const { listFriendsForAdmin } = await import('@/server/domains/friends/service')
    const r = await listFriendsForAdmin(db, { q: 'desc' })
    expect(r.total).toBe(1)
    expect(r.friends[0]?.website).toBe('Hello')
  })
  it('includes hidden friends when includeHidden=true', async () => {
    await seedFriend({ website: 'Hidden', homepage: 'https://hid.com', visible: false })
    const { listFriendsForAdmin } = await import('@/server/domains/friends/service')
    const r = await listFriendsForAdmin(db, { includeHidden: true })
    expect(r.total).toBe(1)
  })
  it('returns only hidden friends when visible=false (pending bucket)', async () => {
    await seedFriend({ website: 'Shown', homepage: 'https://shown.com', visible: true })
    await seedFriend({ website: 'Pending', homepage: 'https://pending.com', visible: false })
    const { listFriendsForAdmin } = await import('@/server/domains/friends/service')
    const r = await listFriendsForAdmin(db, { visible: false })
    expect(r.total).toBe(1)
    expect(r.friends).toHaveLength(1)
    expect(r.friends[0]?.website).toBe('Pending')
  })
})

describe('friends/service — upsertAdminFriend (create)', () => {
  it('creates a new friend and returns the DTO', async () => {
    const { upsertAdminFriend } = await import('@/server/domains/friends/service')
    const dto = await upsertAdminFriend(db, {
      website: 'New',
      homepage: 'https://new.com',
      poster: '/p.png',
      visible: true,
    })
    expect(dto.id).toBeTruthy()
    expect(dto.website).toBe('New')
  })
  it('rejects a duplicate homepage with CONFLICT', async () => {
    await seedFriend({ homepage: 'https://dup.com' })
    const { upsertAdminFriend } = await import('@/server/domains/friends/service')
    await expect(
      upsertAdminFriend(db, {
        website: 'Dup',
        homepage: 'https://dup.com',
        poster: '/p.png',
        visible: true,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  })
  it('trims empty description to null', async () => {
    const { upsertAdminFriend } = await import('@/server/domains/friends/service')
    const dto = await upsertAdminFriend(db, {
      website: 'X',
      description: '   ',
      homepage: 'https://x.com',
      poster: '/p.png',
      visible: true,
    })
    expect(dto.description).toBeNull()
  })
})

describe('friends/service — upsertAdminFriend (update)', () => {
  it('updates an existing friend by id', async () => {
    const id = await seedFriend({ website: 'Old' })
    const { upsertAdminFriend } = await import('@/server/domains/friends/service')
    const dto = await upsertAdminFriend(db, {
      id,
      website: 'Updated',
      homepage: 'https://updated.com',
      poster: '/p.png',
      visible: true,
    })
    expect(dto.website).toBe('Updated')
  })
  it('throws NOT_FOUND when the id does not exist', async () => {
    const { upsertAdminFriend } = await import('@/server/domains/friends/service')
    await expect(
      upsertAdminFriend(db, {
        id: 9999n,
        website: 'X',
        homepage: 'https://x.com',
        poster: '/p.png',
        visible: true,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
  it('rejects a homepage collision with a DIFFERENT row', async () => {
    const id = await seedFriend({ homepage: 'https://keep.com' })
    await seedFriend({ homepage: 'https://other.com' })
    const { upsertAdminFriend } = await import('@/server/domains/friends/service')
    await expect(
      upsertAdminFriend(db, {
        id,
        website: 'X',
        homepage: 'https://other.com',
        poster: '/p.png',
        visible: true,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  })
  it('allows keeping the same homepage on the same row', async () => {
    const id = await seedFriend({ homepage: 'https://same.com' })
    const { upsertAdminFriend } = await import('@/server/domains/friends/service')
    const dto = await upsertAdminFriend(db, {
      id,
      website: 'Renamed',
      homepage: 'https://same.com',
      poster: '/p.png',
      visible: true,
    })
    expect(dto.website).toBe('Renamed')
  })
})

describe('friends/service — deleteAdminFriend', () => {
  it('deletes an existing row and returns true', async () => {
    const id = await seedFriend()
    const { deleteAdminFriend } = await import('@/server/domains/friends/service')
    expect(await deleteAdminFriend(db, id)).toBe(true)
  })
  it('returns false when the row does not exist', async () => {
    const { deleteAdminFriend } = await import('@/server/domains/friends/service')
    expect(await deleteAdminFriend(db, 9999n)).toBe(false)
  })
})

describe('friends/service — listAllFriends', () => {
  it('returns the public catalog shape (website/description/homepage/poster)', async () => {
    await seedFriend({ website: 'A', homepage: 'https://a.com', description: 'desc', poster: '/p.png' })
    const { listAllFriends } = await import('@/server/domains/friends/service')
    const rows = await listAllFriends(db)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      website: 'A',
      description: 'desc',
      homepage: 'https://a.com',
      poster: '/p.png',
    })
  })
  it('returns an empty list when there are no visible friends', async () => {
    const { listAllFriends } = await import('@/server/domains/friends/service')
    expect(await listAllFriends(db)).toEqual([])
  })
})
