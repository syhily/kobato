import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { MusicPlayerBlock, PortableTextBody } from '@/shared/pt/schema'

import { clearAllTables } from '#/_helpers/integration-db'
import { createDbPool, closePool } from '@/server/infra/db/pool'
import { music } from '@/server/infra/db/schema/media'

const { setBlogSettingsBundleForTests } = await import('@/server/domains/settings/services/test-utils')
const { TEST_BLOG_SETTINGS_BUNDLE } = await import('#/_helpers/blog-settings')

// URL building is stubbed at the public-url seam: every path resolves to a
// CDN URL except `musics/coverless.jpg`, which simulates an S3 row whose CDN
// base is gone — the track keeps playing on the bundled default cover.
vi.mock('@/server/infra/storage/public-url', () => ({
  resolveAssetUrl: vi.fn((_driver: string, path: string) => `https://assets.example.com/${path}`),
  safeResolveAssetUrl: vi.fn((_driver: string, path: string) =>
    path === 'musics/coverless.jpg' ? null : `https://assets.example.com/${path}`,
  ),
}))

const ops = await import('@/server/infra/db/operations/music')
const { DEFAULT_MUSIC_COVER_URL } = await import('@/server/domains/music/services/read')
const { prerenderMusicPlayerBlocks } = await import('@/server/domains/pt/prerender')

const poolManager = createDbPool()
const db: NodePgDatabase = poolManager.db
const pool: Pool = poolManager.pool

afterAll(async () => {
  await closePool(pool)
})

beforeEach(async () => {
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
  await clearAllTables(db)
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

describe('server/domains/pt/prerenderMusicPlayerBlocks (db)', () => {
  it('resolves covered and coverless players in one batch query', async () => {
    await seedMusic({ playerId: 'covered', coverStoragePath: 'musics/covered.jpg' })
    await seedMusic({ playerId: 'coverless', coverStoragePath: 'musics/coverless.jpg' })
    const batchSpy = vi.spyOn(ops, 'findMusicByPlayerIds')

    const body: PortableTextBody = [
      { _type: 'musicPlayer', _key: 'm1', playerId: 'covered' },
      { _type: 'musicPlayer', _key: 'm2', playerId: 'coverless' },
    ]

    const result = await prerenderMusicPlayerBlocks(db, body)
    expect(result).toHaveLength(2)

    const covered = result![0] as MusicPlayerBlock
    expect(covered.meta).toBeDefined()
    expect(covered.meta!.cover).toBe('https://assets.example.com/musics/covered.jpg')
    expect(covered.meta!.audioUrl).toContain('https://assets.example.com/')

    // A coverless track stays playable — the cover falls back to the
    // bundled default vinyl image instead of hiding the player.
    const coverless = result![1] as MusicPlayerBlock
    expect(coverless.meta).toBeDefined()
    expect(coverless.meta!.cover).toBe(DEFAULT_MUSIC_COVER_URL)
    expect(coverless.meta!.audioUrl).toContain('https://assets.example.com/')

    // One query regardless of player count.
    expect(batchSpy).toHaveBeenCalledTimes(1)
    expect(batchSpy).toHaveBeenCalledWith(db, ['covered', 'coverless'])
  })

  it('leaves players without a resolvable audio URL unenriched', async () => {
    await seedMusic({ playerId: 'covered', coverStoragePath: 'musics/covered.jpg' })

    const body: PortableTextBody = [
      { _type: 'musicPlayer', _key: 'm1', playerId: 'covered' },
      { _type: 'musicPlayer', _key: 'm2', playerId: 'missing' },
    ]

    const result = await prerenderMusicPlayerBlocks(db, body)
    expect((result![0] as MusicPlayerBlock).meta).toBeDefined()
    expect((result![1] as MusicPlayerBlock).meta).toBeUndefined()
  })
})
