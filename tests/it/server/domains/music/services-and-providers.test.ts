import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'

import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearAllTables } from '#/_helpers/integration-db'
import { flushWorkerRedis } from '#/_helpers/redis'
import { createDbPool, closePool } from '@/server/infra/db/pool'
import { music } from '@/server/infra/db/schema/media'
import { user } from '@/server/infra/db/schema/user'

const { setBlogSettingsBundleForTests } = await import('@/server/domains/settings/services/test-utils')
const { TEST_BLOG_SETTINGS_BUNDLE } = await import('#/_helpers/blog-settings')

vi.mock('@/server/domains/music/storage', () => ({
  ensureMusicStorageEnabled: vi.fn(async () => undefined),
  putMusicAudio: vi.fn(async () => undefined),
  putMusicCover: vi.fn(async () => undefined),
  deleteMusicObject: vi.fn(async () => undefined),
  buildMusicPublicUrl: vi.fn((p: string) => `https://assets.example.com/${p}`),
  safeBuildMusicPublicUrl: vi.fn((p: string) => `https://assets.example.com/${p}`),
}))

const processImageBufferMock = vi.fn(async ({ buffer }: { buffer: Buffer }) => ({
  buffer,
  width: 300,
  height: 300,
  byteSize: buffer.byteLength,
  thumbhash: 'thumb',
}))
vi.mock('@/server/infra/image/process', () => ({
  processImageBuffer: processImageBufferMock,
}))

const read = await import('@/server/domains/music/services/read')
const searchService = await import('@/server/domains/music/services/search')
const addMod = await import('@/server/domains/music/services/write/add')
const metadataMod = await import('@/server/domains/music/services/write/metadata')
const deleteMod = await import('@/server/domains/music/services/write/delete')
const registry = await import('@/server/domains/music/providers/registry')
const neteaseProvider = await import('@/server/domains/music/providers/netease')
const tencentProvider = await import('@/server/domains/music/providers/tencent')

const poolManager = createDbPool()
const db: NodePgDatabase = poolManager.db
const pool: Pool = poolManager.pool

afterAll(async () => {
  await closePool(pool)
})

beforeEach(async () => {
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
  await clearAllTables(db)
  await flushWorkerRedis()
  vi.clearAllMocks()
})

async function seedMusic(overrides: Partial<typeof music.$inferInsert> = {}) {
  const rows = await db
    .insert(music)
    .values({
      source: overrides.source ?? 'netease',
      sourceId: overrides.sourceId ?? `sid-${Math.random().toString(36).slice(2)}`,
      playerId: overrides.playerId ?? `pid-${Math.random().toString(36).slice(2)}`,
      name: overrides.name ?? 'Test Song',
      artist: overrides.artist ?? 'Test Artist',
      album: overrides.album ?? 'Test Album',
      audioStoragePath: overrides.audioStoragePath ?? `musics/${Math.random().toString(36).slice(2)}.mp3`,
      coverStoragePath: overrides.coverStoragePath ?? `musics/${Math.random().toString(36).slice(2)}.jpg`,
      ...overrides,
    })
    .returning()
  return rows[0]
}

async function seedUploader() {
  const rows = await db
    .insert(user)
    .values({ name: 'Up', email: `up-${Math.random().toString(36).slice(2)}@example.com`, password: 'x' })
    .returning()
  return rows[0]
}

describe('music/services/read — listMusicForAdmin', () => {
  it('returns empty when no music', async () => {
    const r = await read.listMusicForAdmin(db, {})
    expect(r.musics).toHaveLength(0)
    expect(r.total).toBe(0)
  })

  it('lists rows with pagination', async () => {
    await seedMusic({ name: 'A' })
    await seedMusic({ name: 'B' })
    const r = await read.listMusicForAdmin(db, { limit: 1 })
    expect(r.musics).toHaveLength(1)
    expect(r.total).toBe(2)
    expect(r.hasMore).toBe(true)
  })

  it('filters by q', async () => {
    await seedMusic({ name: 'Hello World', artist: 'X' })
    await seedMusic({ name: 'Other', artist: 'Y' })
    const r = await read.listMusicForAdmin(db, { q: 'hello' })
    expect(r.musics).toHaveLength(1)
  })

  it('clamps offset and limit', async () => {
    await seedMusic()
    const r = await read.listMusicForAdmin(db, { offset: -5, limit: 1000 })
    expect(r.musics).toHaveLength(1)
  })
})

describe('music/services/read — findMusicDtoById', () => {
  it('returns null for unknown id', async () => {
    expect(await read.findMusicDtoById(db, 9999n)).toBeNull()
  })

  it('returns dto for known id', async () => {
    const m = await seedMusic({ name: 'Find Me' })
    const dto = await read.findMusicDtoById(db, m.id)
    expect(dto?.id).toBe(String(m.id))
    expect(dto?.name).toBe('Find Me')
  })
})

describe('music/services/read — getMusicMetaForPlayer', () => {
  it('returns null for unknown playerId', async () => {
    expect(await read.getMusicMetaForPlayer(db, 'unknown')).toBeNull()
  })

  it('returns player metadata for a known playerId', async () => {
    const m = await seedMusic({ playerId: 'playme', name: 'Player' })
    const meta = await read.getMusicMetaForPlayer(db, 'playme')
    expect(meta).not.toBeNull()
    expect(meta!.name).toBe('Player')
    expect(meta!.url).toContain(m.audioStoragePath)
  })

  it('returns null for soft-deleted rows', async () => {
    await seedMusic({ playerId: 'gone', deletedAt: new Date() })
    expect(await read.getMusicMetaForPlayer(db, 'gone')).toBeNull()
  })
})

describe('music/services/read — findMusicByPlayerIds', () => {
  it('returns empty for empty input', async () => {
    expect(await read.findMusicByPlayerIds(db, [])).toEqual([])
  })

  it('returns rows matching the given player ids', async () => {
    await seedMusic({ playerId: 'a' })
    await seedMusic({ playerId: 'b' })
    const rows = await read.findMusicByPlayerIds(db, ['a', 'b', 'unknown'])
    expect(rows).toHaveLength(2)
  })
})

describe('music/services/write/metadata — updateMusicMetadata', () => {
  it('throws NOT_FOUND when music does not exist', async () => {
    await expect(
      metadataMod.updateMusicMetadata(db, { id: 9999n, name: 'X', artist: [], album: 'A', lyric: null }),
    ).rejects.toThrow(/音乐不存在/)
  })

  it('throws NOT_FOUND when the row is soft-deleted', async () => {
    const m = await seedMusic({ deletedAt: new Date() })
    await expect(
      metadataMod.updateMusicMetadata(db, { id: m.id, name: 'X', artist: [], album: 'A', lyric: null }),
    ).rejects.toThrow(/音乐不存在/)
  })

  it('throws FORBIDDEN when a non-admin viewer is not the uploader', async () => {
    const m = await seedMusic({ uploaderId: 5n })
    await expect(
      metadataMod.updateMusicMetadata(
        db,
        { id: m.id, name: 'X', artist: [], album: 'A', lyric: null },
        { userId: '1', role: 'author' },
      ),
    ).rejects.toThrow()
  })

  it('allows the original uploader (author) to update their own track', async () => {
    const uploader = await seedUploader()
    const m = await seedMusic({ uploaderId: uploader.id, name: 'Old' })
    const dto = await metadataMod.updateMusicMetadata(
      db,
      { id: m.id, name: 'New', artist: ['A', 'B'], album: 'Alb', lyric: '[00:00] Hello' },
      { userId: String(uploader.id), role: 'author' },
    )
    expect(dto.name).toBe('New')
    expect(dto.artist).toEqual(['A', 'B'])
    expect(dto.lyric).toBe('[00:00] Hello')
  })

  it('allows an admin to update another users track', async () => {
    const uploader = await seedUploader()
    const m = await seedMusic({ uploaderId: uploader.id, name: 'Old' })
    const dto = await metadataMod.updateMusicMetadata(
      db,
      { id: m.id, name: 'Admin Edit', artist: ['Admin'], album: 'Admin', lyric: null },
      { userId: '999', role: 'admin' },
    )
    expect(dto.name).toBe('Admin Edit')
  })
})

describe('music/services/write/delete — deleteMusic', () => {
  it('throws NOT_FOUND when music does not exist', async () => {
    await expect(deleteMod.deleteMusic(db, 9999n)).rejects.toThrow(/音乐不存在/)
  })

  it('soft-deletes the row', async () => {
    const m = await seedMusic()
    await deleteMod.deleteMusic(db, m.id, { userId: '1', role: 'admin' })
    const rows = await db.select().from(music).where(eq(music.id, m.id))
    expect(rows[0].deletedAt).not.toBeNull()
  })

  it('throws FORBIDDEN when non-admin viewer is not uploader', async () => {
    const m = await seedMusic({ uploaderId: 9n })
    await expect(deleteMod.deleteMusic(db, m.id, { userId: '1', role: 'author' })).rejects.toThrow()
  })
})

describe('music/services/write/add — addMusic', () => {
  it('returns the existing row when the song is already imported', async () => {
    const existing = await seedMusic({ source: 'netease', sourceId: 'dup' })
    const r = await addMod.addMusic(db, { source: 'netease', sourceId: 'dup', uploader: null })
    expect(BigInt(r.id)).toBe(existing.id)
  })

  it('throws NOT_FOUND when the provider has no track', async () => {
    vi.spyOn(registry, 'getProvider').mockReturnValueOnce({
      source: 'netease',
      search: vi.fn(),
      getTrack: vi.fn(async () => null),
      resolveAudioUrl: vi.fn(),
      resolveCoverUrl: vi.fn(),
      getLyric: vi.fn(),
    })
    await expect(addMod.addMusic(db, { source: 'netease', sourceId: 'unknown', uploader: null })).rejects.toThrow(
      /上游未找到/,
    )
  })

  it('inserts a new row on the happy path', async () => {
    const track = {
      source: 'netease',
      sourceId: 'new-song',
      name: 'New Song',
      artist: ['Singer'],
      album: 'Album',
      picId: 'pic',
      urlId: 'url',
      lyricId: 'lyric',
    }
    vi.spyOn(registry, 'getProvider').mockReturnValueOnce({
      source: 'netease',
      search: vi.fn(),
      getTrack: vi.fn(async () => track),
      resolveAudioUrl: vi.fn(async () => 'https://up.example.com/audio.mp3'),
      resolveCoverUrl: vi.fn(async () => 'https://up.example.com/cover.jpg'),
      getLyric: vi.fn(async () => '[00:00] Hi'),
    })

    const fetchMock = vi.fn(async () => ({
      // `downloadBinary` follows redirects manually and reads `.status`
      // to decide whether the response is a 2xx/4xx (terminal) or a 3xx
      // (follow the Location). A plain object literal omits `status`, so
      // we have to set it explicitly or the loop misreads the response
      // as a redirect without a Location header.
      ok: true,
      status: 200,
      headers: new Headers({ 'content-length': '4' }),
      arrayBuffer: async () => new ArrayBuffer(4),
    })) as unknown as typeof fetch
    vi.stubGlobal('fetch', fetchMock)

    const r = await addMod.addMusic(db, { source: 'netease', sourceId: 'new-song', uploader: null })
    expect(r.name).toBe('New Song')
    expect(r.sourceId).toBe('new-song')
    expect(r.lyric).toBe('[00:00] Hi')
  })
})

describe('music/providers/registry — getProvider', () => {
  it('returns the netease provider', () => {
    expect(registry.getProvider('netease')).toBe(neteaseProvider.neteaseProvider)
  })

  it('returns the tencent provider', () => {
    expect(registry.getProvider('tencent')).toBe(tencentProvider.tencentProvider)
  })

  it('throws for unknown provider', () => {
    expect(() => registry.getProvider('unknown')).toThrow(/Unknown music provider/)
  })
})

describe('music/providers/netease — neteaseProvider', () => {
  it('exposes source = netease', () => {
    expect(neteaseProvider.neteaseProvider.source).toBe('netease')
  })

  it('resolveCoverUrl returns a netease photo url', async () => {
    const url = await neteaseProvider.neteaseProvider.resolveCoverUrl({ picId: 'abc' } as never)
    expect(url).toContain('abc')
  })
})

describe('music/providers/tencent — decodeHtmlEntities', () => {
  it('decodes named entities', () => {
    expect(tencentProvider.decodeHtmlEntities('&quot;hi&quot;')).toBe('"hi"')
  })

  it('decodes decimal entities', () => {
    expect(tencentProvider.decodeHtmlEntities('&#39;x&#39;')).toBe("'x'")
  })

  it('decodes hex entities', () => {
    expect(tencentProvider.decodeHtmlEntities('&#x27;y&#x27;')).toBe("'y'")
  })

  it('returns input unchanged when empty', () => {
    expect(tencentProvider.decodeHtmlEntities('')).toBe('')
  })
})

describe('music/providers/tencent — tencentProvider', () => {
  it('exposes source = tencent', () => {
    expect(tencentProvider.tencentProvider.source).toBe('tencent')
  })

  it('returns empty results for blank keyword', async () => {
    const r = await tencentProvider.tencentProvider.search('  ', 5)
    expect(r.hits).toEqual([])
    expect(r.hasMore).toBe(false)
  })

  it('resolveCoverUrl returns a y.gtimg url', async () => {
    const url = await tencentProvider.tencentProvider.resolveCoverUrl({ picId: 'xyz' } as never)
    expect(url).toContain('xyz')
    expect(url).toContain('y.gtimg.cn')
  })
})

describe('music/services/search — searchMusic', () => {
  it('delegates to the provider and rewrites URLs to proxy form', async () => {
    vi.spyOn(registry, 'getProvider').mockReturnValueOnce({
      source: 'netease',
      search: vi.fn(async () => ({
        hits: [
          {
            source: 'netease',
            sourceId: '123',
            name: 'Hit',
            artist: ['Singer'],
            album: 'Album',
            coverUrl: 'https://cover',
            previewUrl: 'https://audio',
          },
        ],
        hasMore: false,
      })),
      getTrack: vi.fn(),
      resolveAudioUrl: vi.fn(),
      resolveCoverUrl: vi.fn(),
      getLyric: vi.fn(),
    })

    const r = await searchService.searchMusic('netease', 'keyword')
    expect(r.results).toHaveLength(1)
    expect(r.results[0].coverUrl).toContain('/admin/music/proxy/cover')
    expect(r.results[0].previewUrl).toContain('/admin/music/proxy/audio')
  })
})
