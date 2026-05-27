import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'

import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import {
  findMusicByPlayerId,
  findMusicBySourceAndId,
  insertMusic,
  softDeleteMusic,
} from '@/server/infra/db/operations/music'
import { createDbPool, closePool } from '@/server/infra/db/pool'
import { music } from '@/server/infra/db/schema/media'

const poolManager = createDbPool()
const db: NodePgDatabase = poolManager.db
const pool: Pool = poolManager.pool

afterAll(async () => {
  await closePool(pool)
})

beforeEach(async () => {
  await db.delete(music)
})

describe('db/query/music — insertMusic', () => {
  it('writes the row and stamps createdAt + updatedAt', async () => {
    const result = await insertMusic(db, {
      source: 'netease',
      sourceId: '12345',
      playerId: 'abcdef0123456789',
      name: 'Hello',
      artist: 'Adele',
      album: '25',
      audioStoragePath: 'musics/abcdef0123456789.mp3',
      coverStoragePath: 'musics/abcdef0123456789.jpg',
      lyric: '[00:00.000]Hello',
      uploaderId: null,
    })

    expect(result.source).toBe('netease')
    expect(result.playerId).toBe('abcdef0123456789')
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })
})

describe('db/query/music — findMusicByPlayerId', () => {
  it('returns the row when playerId matches and is not soft-deleted', async () => {
    await insertMusic(db, makeMusic({ playerId: 'abcdef0123456789' }))
    const found = await findMusicByPlayerId(db, 'abcdef0123456789')
    expect(found).not.toBeNull()
    expect(found?.playerId).toBe('abcdef0123456789')
  })

  it('returns null when no row matches', async () => {
    const found = await findMusicByPlayerId(db, 'zzzzzzzzzzzzzzzz')
    expect(found).toBeNull()
  })
})

describe('db/query/music — findMusicBySourceAndId', () => {
  it('queries by (source, sourceId) for the importer idempotency check', async () => {
    await insertMusic(db, makeMusic({ source: 'netease', sourceId: '999' }))
    const found = await findMusicBySourceAndId(db, 'netease', '999')
    expect(found).not.toBeNull()
    expect(found?.source).toBe('netease')
    expect(found?.sourceId).toBe('999')
  })
})

describe('db/query/music — softDeleteMusic', () => {
  it('writes deleted_at + updated_at and returns the soft-deleted row', async () => {
    const inserted = await insertMusic(db, makeMusic())
    const out = await softDeleteMusic(db, inserted.id)
    expect(out).not.toBeNull()
    expect(out?.deletedAt).not.toBeNull()
  })

  it('returns null when no row matches the id', async () => {
    const out = await softDeleteMusic(db, 0n)
    expect(out).toBeNull()
  })
})

interface MusicOverrides {
  source?: string
  sourceId?: string
  playerId?: string
  name?: string
  artist?: string
  album?: string
  audioStoragePath?: string
  coverStoragePath?: string
  lyric?: string | null
  uploaderId?: bigint | null
}

function makeMusic(overrides: MusicOverrides = {}): Parameters<typeof insertMusic>[1] {
  return {
    source: overrides.source ?? 'netease',
    sourceId: overrides.sourceId ?? '35847388',
    playerId: overrides.playerId ?? 'abcdef0123456789',
    name: overrides.name ?? 'Hello',
    artist: overrides.artist ?? 'Adele',
    album: overrides.album ?? '25',
    audioStoragePath: overrides.audioStoragePath ?? 'musics/abcdef0123456789.mp3',
    coverStoragePath: overrides.coverStoragePath ?? 'musics/abcdef0123456789.jpg',
    lyric: overrides.lyric ?? null,
    uploaderId: overrides.uploaderId ?? null,
  }
}
