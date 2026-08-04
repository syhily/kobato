import type { StorageBackend } from '@kobato/server/infra/storage/backend'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { makeMemoryBackend } from '#/_helpers/memory-storage'

import { music } from '@kobato/server/infra/db/schema/media'
import { user } from '@kobato/server/infra/db/schema/user'
import { __resetStorageBackendsForTests, __setStorageBackendForTests } from '@kobato/server/infra/storage/registry'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

const { setBlogSettingsBundleForTests } = await import('#/_helpers/blog-settings')
const { TEST_BLOG_SETTINGS_BUNDLE } = await import('#/_helpers/blog-settings')

// The storage registry is NOT module-mocked: both driver slots route at
// the shared in-memory backend through the registry test seam. `put` on
// the 's3' slot is a spy wrapping the real memory implementation so the
// addMusic happy path can still pin the visibility/content-type arguments
// — spying on a real implementation, not stubbing the module.
const s3Memory = makeMemoryBackend({ driver: 's3' })
const localMemory = makeMemoryBackend({ driver: 'local' })
let s3Put: Mock<StorageBackend['put']>

vi.mock('@kobato/server/infra/storage/public-url', () => ({
  resolveAssetUrl: vi.fn((_driver: string, p: string) => `https://assets.example.com/${p}`),
  safeResolveAssetUrl: vi.fn((_driver: string, p: string) => `https://assets.example.com/${p}`),
}))

const processImageBufferMock = vi.fn(async ({ buffer }: { buffer: Buffer }) => ({
  buffer,
  width: 300,
  height: 300,
  byteSize: buffer.byteLength,
  thumbhash: 'thumb',
}))
vi.mock('@kobato/server/infra/image/process', () => ({
  processImageBuffer: processImageBufferMock,
}))

const read = await import('@kobato/server/domains/music/services/read')
const musicOps = await import('@kobato/server/infra/db/operations/music')
const publicUrlMod = await import('@kobato/server/infra/storage/public-url')
const searchService = await import('@kobato/server/domains/music/services/search')
const addMod = await import('@kobato/server/domains/music/services/write/add')
const metadataMod = await import('@kobato/server/domains/music/services/write/metadata')
const deleteMod = await import('@kobato/server/domains/music/services/write/delete')
const registry = await import('@kobato/server/domains/music/providers/registry')
const neteaseProvider = await import('@kobato/server/domains/music/providers/netease')
const tencentProvider = await import('@kobato/server/domains/music/providers/tencent')

const db = getTestDb()

beforeEach(async () => {
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
  await clearAllTables(db)
  vi.clearAllMocks()
  // After clearAllMocks so the spy starts empty. The 's3' memory backend
  // is available, so the real registry resolves it as the active backend;
  // 'local' is swapped too so backendFor('local') never touches disk.
  s3Put = vi.fn(s3Memory.backend.put)
  __setStorageBackendForTests('s3', { ...s3Memory.backend, put: s3Put })
  __setStorageBackendForTests('local', localMemory.backend)
})

afterEach(() => {
  __resetStorageBackendsForTests()
  s3Memory.reset()
  localMemory.reset()
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
    expect(await read.findMusicDtoById(db, 9999)).toBeNull()
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

describe('music/services/read — getPublicMusicMetasByIds', () => {
  it('returns an empty map for empty input', async () => {
    expect(await read.getPublicMusicMetasByIds(db, [])).toEqual(new Map())
  })

  it('resolves metas for the given player ids in one batch query', async () => {
    await seedMusic({ playerId: 'a' })
    await seedMusic({ playerId: 'b' })
    const metas = await read.getPublicMusicMetasByIds(db, ['a', 'b', 'unknown'])
    expect(metas.size).toBe(2)
    expect(metas.get('a')?.url).toContain('https://assets.example.com/')
    expect(metas.get('a')?.pic).toContain('https://assets.example.com/')
  })

  it('keeps a coverless track playable with the default cover', async () => {
    await seedMusic({ playerId: 'nocover', coverStoragePath: 'musics/nocover.jpg' })
    const buildMock = vi.mocked(publicUrlMod.safeResolveAssetUrl)
    // toPublicMusicMeta builds the audio URL first, then the cover URL.
    buildMock.mockImplementationOnce((_driver: string, path: string) => `https://assets.example.com/${path}`)
    buildMock.mockImplementationOnce(() => null)
    const metas = await read.getPublicMusicMetasByIds(db, ['nocover'])
    expect(metas.get('nocover')?.pic).toBe(read.DEFAULT_MUSIC_COVER_URL)
    expect(metas.get('nocover')?.url).toContain('https://assets.example.com/')
  })

  it('drops entries whose audio URL is unbuildable', async () => {
    await seedMusic({ playerId: 'noaudio' })
    vi.mocked(publicUrlMod.safeResolveAssetUrl).mockImplementationOnce(() => null)
    const metas = await read.getPublicMusicMetasByIds(db, ['noaudio'])
    expect(metas.size).toBe(0)
  })
})

describe('music/services/write/metadata — updateMusicMetadata', () => {
  it('throws NOT_FOUND when music does not exist', async () => {
    await expect(
      metadataMod.updateMusicMetadata(db, { id: 9999, name: 'X', artist: [], album: 'A', lyric: null }),
    ).rejects.toThrow(/音乐不存在/)
  })

  it('throws NOT_FOUND when the row is soft-deleted', async () => {
    const m = await seedMusic({ deletedAt: new Date() })
    await expect(
      metadataMod.updateMusicMetadata(db, { id: m.id, name: 'X', artist: [], album: 'A', lyric: null }),
    ).rejects.toThrow(/音乐不存在/)
  })

  it('throws FORBIDDEN when a non-admin viewer is not the uploader', async () => {
    const m = await seedMusic({ uploaderId: 5 })
    await expect(
      metadataMod.updateMusicMetadata(
        db,
        { id: m.id, name: 'X', artist: [], album: 'A', lyric: null },
        { id: '1', role: 'author' },
      ),
    ).rejects.toThrow()
  })

  it('allows the original uploader (author) to update their own track', async () => {
    const uploader = await seedUploader()
    const m = await seedMusic({ uploaderId: uploader.id, name: 'Old' })
    const dto = await metadataMod.updateMusicMetadata(
      db,
      { id: m.id, name: 'New', artist: ['A', 'B'], album: 'Alb', lyric: '[00:00] Hello' },
      { id: String(uploader.id), role: 'author' },
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
      { id: '999', role: 'admin' },
    )
    expect(dto.name).toBe('Admin Edit')
  })
})

describe('music/services/write/delete — deleteMusic', () => {
  it('throws NOT_FOUND when music does not exist', async () => {
    await expect(deleteMod.deleteMusic(db, 9999)).rejects.toThrow(/音乐不存在/)
  })

  it('soft-deletes the row', async () => {
    const m = await seedMusic()
    await deleteMod.deleteMusic(db, m.id, { id: '1', role: 'admin' })
    const rows = await db.select().from(music).where(eq(music.id, m.id))
    expect(rows[0].deletedAt).not.toBeNull()
  })

  it('throws FORBIDDEN when non-admin viewer is not uploader', async () => {
    const m = await seedMusic({ uploaderId: 9 })
    await expect(deleteMod.deleteMusic(db, m.id, { id: '1', role: 'author' })).rejects.toThrow()
  })
})

describe('music/services/write/add — addMusic', () => {
  it('returns the existing row when the song is already imported', async () => {
    const existing = await seedMusic({ source: 'netease', sourceId: 'dup' })
    const r = await addMod.addMusic(db, { source: 'netease', sourceId: 'dup', uploader: null })
    expect(Number(r.id)).toBe(existing.id)
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
    const resolveAudioUrl = vi.fn(async () => 'https://up.example.com/audio.mp3')
    const resolveCoverUrl = vi.fn(async () => 'https://up.example.com/cover.jpg')
    vi.spyOn(registry, 'getProvider').mockReturnValueOnce({
      source: 'netease',
      search: vi.fn(),
      getTrack: vi.fn(async () => track),
      resolveAudioUrl,
      resolveCoverUrl,
      getLyric: vi.fn(async () => '[00:00] Hi'),
    })

    // A real Response: `downloadBinary` follows redirects manually off
    // `.status` and streams the body through a size-capped reader, so a
    // plain object literal no longer suffices.
    const fetchMock = vi.fn(
      async () => new Response(new Uint8Array(4), { status: 200, headers: { 'content-length': '4' } }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const r = await addMod.addMusic(db, { source: 'netease', sourceId: 'new-song', uploader: null })
    expect(r.name).toBe('New Song')
    expect(r.sourceId).toBe('new-song')
    expect(r.lyric).toBe('[00:00] Hi')
    expect(resolveAudioUrl).toHaveBeenCalledTimes(1)
    expect(resolveAudioUrl).toHaveBeenCalledWith(track)
    expect(resolveCoverUrl).toHaveBeenCalledTimes(1)
    expect(resolveCoverUrl).toHaveBeenCalledWith(track)
    // Both assets land on the active backend with their fixed content types
    // (MP3 audio, JPEG cover) and public visibility — asserted on a spy
    // wrapping the real memory backend, and backed by store state.
    expect(s3Put).toHaveBeenCalledWith(
      expect.objectContaining({ key: r.audioStoragePath, contentType: 'audio/mpeg', visibility: 'public' }),
    )
    expect(s3Put).toHaveBeenCalledWith(
      expect.objectContaining({ key: r.coverStoragePath, contentType: 'image/jpeg', visibility: 'public' }),
    )
    expect(s3Memory.store.has(r.audioStoragePath)).toBe(true)
    expect(s3Memory.store.has(r.coverStoragePath)).toBe(true)
  })

  it('restores the soft-deleted row when the same song is re-added', async () => {
    const track = {
      source: 'netease',
      sourceId: 're-add',
      name: 'Song',
      artist: ['Singer'],
      album: 'Album',
      picId: 'pic',
      urlId: 'url',
      lyricId: 'lyric',
    }
    const mockProviderOnce = (name: string) =>
      vi.spyOn(registry, 'getProvider').mockReturnValueOnce({
        source: 'netease',
        search: vi.fn(),
        getTrack: vi.fn(async () => ({ ...track, name })),
        resolveAudioUrl: vi.fn(async () => 'https://up.example.com/audio.mp3'),
        resolveCoverUrl: vi.fn(async () => 'https://up.example.com/cover.jpg'),
        getLyric: vi.fn(async () => '[00:00] Hi'),
      })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(new Uint8Array(4), { status: 200, headers: { 'content-length': '4' } })),
    )

    mockProviderOnce('Song')
    const first = await addMod.addMusic(db, { source: 'netease', sourceId: 're-add', uploader: null })
    await deleteMod.deleteMusic(db, Number(first.id))
    expect(s3Memory.store.has(first.audioStoragePath)).toBe(false)

    // Re-adding the same (source, sourceId) must restore the soft-deleted
    // row — not die on the UNIQUE constraint it still occupies.
    mockProviderOnce('Song Remastered')
    const second = await addMod.addMusic(db, { source: 'netease', sourceId: 're-add', uploader: null })

    expect(second.id).toBe(first.id)
    expect(second.playerId).toBe(first.playerId)
    expect(second.name).toBe('Song Remastered')
    const rows = await db.select().from(music)
    expect(rows).toHaveLength(1)
    expect(rows[0].deletedAt).toBeNull()
    // deleteMusic removed the objects; the restore re-uploads them to the
    // row's original storage paths.
    expect(second.audioStoragePath).toBe(first.audioStoragePath)
    expect(s3Memory.store.has(second.audioStoragePath)).toBe(true)
    expect(s3Memory.store.has(second.coverStoragePath)).toBe(true)
  })

  it('keeps the re-uploaded objects when the restore write fails but the row still claims the paths', async () => {
    // The concurrent-restore race: two re-adds restore the SAME
    // soft-deleted row (restoreMusic has no deletedAt guard, so both
    // pass it), then the loser's write fails on an independent database
    // error. Its rollback must NOT delete the objects the row still
    // claims — that would orphan the winner's live row (player 404).
    const row = await seedMusic({
      source: 'netease',
      sourceId: 'restore-race',
      deletedAt: new Date(),
      storageDriver: 's3',
      audioStoragePath: 'musics/restore-race.mp3',
      coverStoragePath: 'musics/restore-race.jpg',
    })
    vi.spyOn(registry, 'getProvider').mockReturnValueOnce({
      source: 'netease',
      search: vi.fn(),
      getTrack: vi.fn(async () => ({
        source: 'netease',
        sourceId: 'restore-race',
        name: 'Song',
        artist: ['Singer'],
        album: 'Album',
        picId: 'pic',
        urlId: 'url',
        lyricId: 'lyric',
      })),
      resolveAudioUrl: vi.fn(async () => 'https://up.example.com/audio.mp3'),
      resolveCoverUrl: vi.fn(async () => 'https://up.example.com/cover.jpg'),
      getLyric: vi.fn(async () => '[00:00] Hi'),
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(new Uint8Array(4), { status: 200, headers: { 'content-length': '4' } })),
    )
    // The winner's restore landed (the row is live again on the same
    // paths); the loser's restore then fails on an independent error.
    vi.spyOn(musicOps, 'restoreMusic').mockImplementationOnce(async () => {
      await db.update(music).set({ deletedAt: null }).where(eq(music.id, row.id))
      throw new Error('independent database error')
    })

    await expect(addMod.addMusic(db, { source: 'netease', sourceId: 'restore-race', uploader: null })).rejects.toThrow(
      /音乐元数据写入失败/,
    )

    expect(s3Memory.store.has('musics/restore-race.mp3')).toBe(true)
    expect(s3Memory.store.has('musics/restore-race.jpg')).toBe(true)
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
  it('delegates to the provider and rewrites URLs to proxy form without resolving them', async () => {
    const resolveAudioUrl = vi.fn()
    const resolveCoverUrl = vi.fn()
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
            picId: 'pic123',
            urlId: 'url123',
            lyricId: 'lyric123',
          },
        ],
        hasMore: false,
      })),
      getTrack: vi.fn(),
      resolveAudioUrl,
      resolveCoverUrl,
      getLyric: vi.fn(),
    })

    const r = await searchService.searchMusic('netease', 'keyword')
    expect(r.results).toHaveLength(1)
    expect(r.results[0].coverUrl).toContain('/admin/music/proxy/cover')
    expect(r.results[0].previewUrl).toContain('/admin/music/proxy/audio')
    expect(resolveAudioUrl).not.toHaveBeenCalled()
    expect(resolveCoverUrl).not.toHaveBeenCalled()
  })
})
