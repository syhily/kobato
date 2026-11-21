import { friend } from '@kobato/db/schema/friend'
import { image } from '@kobato/db/schema/media'
import { __resetStorageBackendsForTests, __setStorageBackendForTests } from '@kobato/server/infra/storage/registry'
import { clearAllTables, getTestDb } from '@kobato/server/tests/utils/integration-db'
import { makeMemoryBackend } from '@kobato/server/tests/utils/memory-storage'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const db = getTestDb()
const mem = makeMemoryBackend()

beforeEach(async () => {
  __setStorageBackendForTests('s3', mem.backend)
  await clearAllTables(db)
})

afterEach(() => {
  __resetStorageBackendsForTests()
  mem.reset()
})

async function seedFriend(opts: Partial<typeof friend.$inferInsert> = {}): Promise<number> {
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

function posterFor(homepage: string): string {
  return `/storage/images/links/${new URL(homepage).hostname}.jpg`
}

async function seedUploadedPoster(homepage: string, body = Buffer.from('friend poster')): Promise<void> {
  const storagePath = `images/links/${new URL(homepage).hostname}.jpg`
  await db.insert(image).values({
    storagePath,
    storageDriver: 's3',
    mimeType: 'image/jpeg',
    width: 1280,
    height: 425,
    byteSize: body.length,
  })
  mem.store.set(storagePath, { body, contentType: 'image/jpeg' })
}

describe('friends/service — toPublicFriend', () => {
  it('projects a row to the public DTO', async () => {
    const { toPublicFriend } = await import('@kobato/server/domains/friends/service')
    const dto = toPublicFriend({
      id: 1,
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
    const { toPublicFriend } = await import('@kobato/server/domains/friends/service')
    const dto = toPublicFriend({
      id: 1,
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
    const { toAdminFriendDto } = await import('@kobato/server/domains/friends/service')
    const dto = toAdminFriendDto({
      id: 7,
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
    const { listPublicFriends } = await import('@kobato/server/domains/friends/service')
    const rows = await listPublicFriends(db)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.website).toBe('A')
  })
  it('returns an empty list when there are no visible friends', async () => {
    const { listPublicFriends } = await import('@kobato/server/domains/friends/service')
    expect(await listPublicFriends(db)).toEqual([])
  })
})

describe('friends/service — listFriendsForAdmin', () => {
  it('paginates and returns total + hasMore', async () => {
    await seedFriend({ website: 'A', homepage: 'https://a.com' })
    await seedFriend({ website: 'B', homepage: 'https://b.com' })
    await seedFriend({ website: 'C', homepage: 'https://c.com' })
    const { listFriendsForAdmin } = await import('@kobato/server/domains/friends/service')
    const r = await listFriendsForAdmin(db, { offset: 0, limit: 2 })
    expect(r.friends).toHaveLength(2)
    expect(r.total).toBe(3)
    expect(r.hasMore).toBe(true)
  })
  it('matches by q against website/description/homepage', async () => {
    await seedFriend({ website: 'Hello', homepage: 'https://h.com', description: 'desc' })
    await seedFriend({ website: 'World', homepage: 'https://w.com' })
    const { listFriendsForAdmin } = await import('@kobato/server/domains/friends/service')
    const r = await listFriendsForAdmin(db, { q: 'desc' })
    expect(r.total).toBe(1)
    expect(r.friends[0]?.website).toBe('Hello')
  })
  it('includes hidden friends when includeHidden=true', async () => {
    await seedFriend({ website: 'Hidden', homepage: 'https://hid.com', visible: false })
    const { listFriendsForAdmin } = await import('@kobato/server/domains/friends/service')
    const r = await listFriendsForAdmin(db, { includeHidden: true })
    expect(r.total).toBe(1)
  })
  it('returns only hidden friends when visible=false (pending bucket)', async () => {
    await seedFriend({ website: 'Shown', homepage: 'https://shown.com', visible: true })
    await seedFriend({ website: 'Pending', homepage: 'https://pending.com', visible: false })
    const { listFriendsForAdmin } = await import('@kobato/server/domains/friends/service')
    const r = await listFriendsForAdmin(db, { visible: false })
    expect(r.total).toBe(1)
    expect(r.friends).toHaveLength(1)
    expect(r.friends[0]?.website).toBe('Pending')
  })
})

describe('friends/service — upsertAdminFriend (create)', () => {
  it('creates a new friend and returns the DTO', async () => {
    const { upsertAdminFriend } = await import('@kobato/server/domains/friends/service')
    const dto = await upsertAdminFriend(db, {
      website: 'New',
      homepage: 'https://new.com',
      poster: posterFor('https://new.com'),
      visible: true,
    })
    expect(dto.id).toBeTruthy()
    expect(dto.website).toBe('New')
  })
  it('rejects a duplicate homepage with CONFLICT', async () => {
    await seedFriend({ homepage: 'https://dup.com' })
    const { upsertAdminFriend } = await import('@kobato/server/domains/friends/service')
    await expect(
      upsertAdminFriend(db, {
        website: 'Dup',
        homepage: 'https://dup.com',
        poster: posterFor('https://dup.com'),
        visible: true,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  })
  it('trims empty description to null', async () => {
    const { upsertAdminFriend } = await import('@kobato/server/domains/friends/service')
    const dto = await upsertAdminFriend(db, {
      website: 'X',
      description: '   ',
      homepage: 'https://x.com',
      poster: posterFor('https://x.com'),
      visible: true,
    })
    expect(dto.description).toBeNull()
  })

  it('rejects custom remote posters and posters for another host', async () => {
    const { upsertAdminFriend } = await import('@kobato/server/domains/friends/service')
    const base = { website: 'X', homepage: 'https://x.com', visible: true }
    await expect(upsertAdminFriend(db, { ...base, poster: 'https://x.com/custom.jpg' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      descriptor: { messageKey: 'friends.error.posterUploadRequired' },
    })
    await expect(
      upsertAdminFriend(db, { ...base, poster: '/storage/images/links/other.com.jpg' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('rejects an off-site absolute URL even when its path matches', async () => {
    const { upsertAdminFriend } = await import('@kobato/server/domains/friends/service')
    await expect(
      upsertAdminFriend(db, {
        website: 'X',
        homepage: 'https://x.com',
        poster: 'https://attacker.invalid/storage/images/links/x.com.jpg',
        visible: true,
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })
})

describe('friends/service — upsertAdminFriend (update)', () => {
  it('updates an existing friend by id', async () => {
    const id = await seedFriend({ website: 'Old', homepage: 'https://updated.com' })
    const { upsertAdminFriend } = await import('@kobato/server/domains/friends/service')
    const dto = await upsertAdminFriend(db, {
      id,
      website: 'Updated',
      homepage: 'https://updated.com',
      poster: posterFor('https://updated.com'),
      visible: true,
    })
    expect(dto.website).toBe('Updated')
  })
  it('throws NOT_FOUND when the id does not exist', async () => {
    const { upsertAdminFriend } = await import('@kobato/server/domains/friends/service')
    await expect(
      upsertAdminFriend(db, {
        id: 9999,
        website: 'X',
        homepage: 'https://x.com',
        poster: posterFor('https://x.com'),
        visible: true,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
  it('rejects a homepage collision with a DIFFERENT row', async () => {
    const id = await seedFriend({ homepage: 'https://keep.com' })
    await seedFriend({ homepage: 'https://other.com' })
    const { upsertAdminFriend } = await import('@kobato/server/domains/friends/service')
    await expect(
      upsertAdminFriend(db, {
        id,
        website: 'X',
        homepage: 'https://other.com',
        poster: posterFor('https://other.com'),
        visible: true,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  })
  it('allows keeping the same homepage on the same row', async () => {
    const id = await seedFriend({ homepage: 'https://same.com' })
    const { upsertAdminFriend } = await import('@kobato/server/domains/friends/service')
    const dto = await upsertAdminFriend(db, {
      id,
      website: 'Renamed',
      homepage: 'https://same.com',
      poster: posterFor('https://same.com'),
      visible: true,
    })
    expect(dto.website).toBe('Renamed')
  })

  it('moves the uploaded poster object and metadata when the homepage host changes', async () => {
    const previousHomepage = 'https://old.example.com/about'
    const homepage = 'https://new.example.com/blog'
    await seedUploadedPoster(previousHomepage)
    const id = await seedFriend({
      homepage: previousHomepage,
      poster: `${posterFor(previousHomepage)}?v=123`,
    })
    const { upsertAdminFriend } = await import('@kobato/server/domains/friends/service')

    const dto = await upsertAdminFriend(db, {
      id,
      website: 'Moved',
      homepage,
      poster: `${posterFor(homepage)}?v=123`,
      visible: true,
    })

    expect(dto.poster).toBe('/storage/images/links/new.example.com.jpg?v=123')
    expect(mem.store.has('images/links/old.example.com.jpg')).toBe(false)
    expect(mem.store.get('images/links/new.example.com.jpg')?.body.toString()).toBe('friend poster')
    const images = await db.select().from(image)
    expect(images).toHaveLength(1)
    expect(images[0]?.storagePath).toBe('images/links/new.example.com.jpg')
  })

  it('uses an already uploaded target poster without removing its previous object', async () => {
    const previousHomepage = 'https://old.example.com'
    const homepage = 'https://new.example.com'
    await seedUploadedPoster(previousHomepage, Buffer.from('old'))
    await seedUploadedPoster(homepage, Buffer.from('new'))
    const id = await seedFriend({ homepage: previousHomepage, poster: posterFor(previousHomepage) })
    const { upsertAdminFriend } = await import('@kobato/server/domains/friends/service')

    const dto = await upsertAdminFriend(db, {
      id,
      website: 'Moved',
      homepage,
      poster: `${posterFor(homepage)}?v=456`,
      visible: true,
    })

    expect(dto.poster).toBe('/storage/images/links/new.example.com.jpg?v=456')
    expect(mem.store.get('images/links/old.example.com.jpg')?.body.toString()).toBe('old')
    expect(mem.store.get('images/links/new.example.com.jpg')?.body.toString()).toBe('new')
  })

  it('does not update the friend when the previous uploaded poster is missing', async () => {
    const previousHomepage = 'https://old.example.com'
    const id = await seedFriend({ homepage: previousHomepage, poster: posterFor(previousHomepage) })
    const { upsertAdminFriend } = await import('@kobato/server/domains/friends/service')

    await expect(
      upsertAdminFriend(db, {
        id,
        website: 'Moved',
        homepage: 'https://new.example.com',
        poster: posterFor('https://new.example.com'),
        visible: true,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', descriptor: { messageKey: 'images.error.objectMissing' } })
    const [unchanged] = await db.select().from(friend).where(eq(friend.id, id))
    expect(unchanged?.homepage).toBe(previousHomepage)
  })
})

describe('friends/service — deleteAdminFriend', () => {
  it('deletes an existing row and returns true', async () => {
    const id = await seedFriend()
    const { deleteAdminFriend } = await import('@kobato/server/domains/friends/service')
    expect(await deleteAdminFriend(db, id)).toBe(true)
  })
  it('returns false when the row does not exist', async () => {
    const { deleteAdminFriend } = await import('@kobato/server/domains/friends/service')
    expect(await deleteAdminFriend(db, 9999)).toBe(false)
  })
})

describe('friends/service — listAllFriends', () => {
  it('returns the public catalog shape (website/description/homepage/poster)', async () => {
    await seedFriend({ website: 'A', homepage: 'https://a.com', description: 'desc', poster: '/p.png' })
    const { listAllFriends } = await import('@kobato/server/domains/friends/service')
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
    const { listAllFriends } = await import('@kobato/server/domains/friends/service')
    expect(await listAllFriends(db)).toEqual([])
  })
})
