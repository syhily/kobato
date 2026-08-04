import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { makePublicCtx } from '#/_helpers/mock-ctx'

import { music } from '@kobato/server/infra/db/schema/media'
import { __resetRateLimitsForTests } from '@kobato/server/infra/rate-limit'
import { call } from '@orpc/server'
import { beforeEach, describe, expect, it } from 'vitest'

const { musicRouter } = await import('@kobato/server/http/controllers/music.controller')

const db = getTestDb()

beforeEach(async () => {
  __resetRateLimitsForTests()
  await clearAllTables(db)
})

async function seedMusic(overrides: Partial<typeof music.$inferInsert> = {}) {
  const rows = await db
    .insert(music)
    .values({
      source: 'netease',
      sourceId: 'sid-1',
      playerId: 'abc123def4567890',
      name: 'Test Song',
      artist: 'Test Artist',
      album: 'Test Album',
      audioStoragePath: 'musics/abc123def4567890.mp3',
      coverStoragePath: 'musics/abc123def4567890.jpg',
      storageDriver: 's3',
      lyric: '[00:00.00]Lyric line 1',
      ...overrides,
    })
    .returning()
  return rows[0]!
}

describe('musicRouter.get', () => {
  it('returns music meta on hit', async () => {
    await seedMusic()
    const ctx = makePublicCtx({ db })
    const res = (await call(musicRouter.get, { id: 'abc123def4567890' }, { context: ctx })) as {
      music: { id: string; name: string; artist: string; album: string; url: string; pic: string; lyric: string }
    }
    expect(res.music).toEqual({
      id: 'abc123def4567890',
      name: 'Test Song',
      artist: 'Test Artist',
      album: 'Test Album',
      url: 'https://assets.example.com/musics/abc123def4567890.mp3',
      pic: 'https://assets.example.com/musics/abc123def4567890.jpg',
      lyric: '[00:00.00]Lyric line 1',
    })
  })

  it('throws NOT_FOUND when music is missing', async () => {
    const ctx = makePublicCtx({ db })
    await expect(call(musicRouter.get, { id: '0000000000000000' }, { context: ctx })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })
})
