import type { Database } from '@kobato/db/database'
import type { MusicRow, NewMusic } from '@kobato/db/types'

import { sqliteOf } from '@kobato/db/database'
import { likeEscape } from '@kobato/db/like-escape'
import { applyPage, assembleWhere, withUploader } from '@kobato/db/operations/admin-list'
import { music } from '@kobato/db/schema/media'
import { and, asc, count, desc, eq, isNull, or, type SQL } from 'drizzle-orm'

export interface AdminMusicListFilters {
  q?: string
  offset?: number
  limit?: number
  sortBy?: 'createdAt' | 'updatedAt' | 'name' | 'artist' | 'album'
  sortOrder?: 'asc' | 'desc'
  includeDeleted?: boolean
}

export interface AdminMusicRowWithUploader extends MusicRow {
  uploaderName: string | null
}

const musicUploader = withUploader({
  table: music,
  idColumn: music.id,
  uploaderIdColumn: music.uploaderId,
  columns: {
    id: music.id,
    createdAt: music.createdAt,
    updatedAt: music.updatedAt,
    deletedAt: music.deletedAt,
    source: music.source,
    sourceId: music.sourceId,
    playerId: music.playerId,
    name: music.name,
    artist: music.artist,
    album: music.album,
    audioStoragePath: music.audioStoragePath,
    coverStoragePath: music.coverStoragePath,
    storageDriver: music.storageDriver,
    lyric: music.lyric,
    uploaderId: music.uploaderId,
  },
})

function buildAdminMusicConditions(filters: AdminMusicListFilters): SQL[] {
  const conditions: SQL[] = []

  if (!filters.includeDeleted) {
    conditions.push(isNull(music.deletedAt))
  }

  if (filters.q && filters.q.trim() !== '') {
    const q = filters.q.trim()
    const search = or(
      likeEscape(music.name, q),
      likeEscape(music.artist, q),
      likeEscape(music.album, q),
      likeEscape(music.sourceId, q),
      likeEscape(music.playerId, q),
    )
    if (search) {
      conditions.push(search)
    }
  }

  return conditions
}

const COLUMN_MAP = {
  createdAt: music.createdAt,
  updatedAt: music.updatedAt,
  name: music.name,
  artist: music.artist,
  album: music.album,
} as const

function buildOrderBy(filters: AdminMusicListFilters): SQL {
  const col = COLUMN_MAP[filters.sortBy ?? 'createdAt']
  return filters.sortOrder === 'asc' ? asc(col) : desc(col)
}

export async function listAdminMusicRows(
  db: Database,
  filters: AdminMusicListFilters = {},
): Promise<AdminMusicRowWithUploader[]> {
  const where = assembleWhere(buildAdminMusicConditions(filters))
  const baseQuery = musicUploader.selectJoined(db)
  const q = where ? baseQuery.where(where).orderBy(buildOrderBy(filters)) : baseQuery.orderBy(buildOrderBy(filters))
  return applyPage(q, filters)
}

export async function findAdminMusicRowById(db: Database, id: number): Promise<AdminMusicRowWithUploader | null> {
  return musicUploader.findJoinedRowById(db, id)
}

export async function countAdminMusic(db: Database, filters: AdminMusicListFilters = {}): Promise<number> {
  const where = assembleWhere(buildAdminMusicConditions(filters))
  const rows = where
    ? await sqliteOf(db).select({ value: count() }).from(music).where(where)
    : await sqliteOf(db).select({ value: count() }).from(music)
  return rows[0]?.value ?? 0
}

export async function findMusicById(db: Database, id: number): Promise<MusicRow | null> {
  const rows = await sqliteOf(db).select().from(music).where(eq(music.id, id)).limit(1)
  return rows[0] ?? null
}

export async function findMusicByPlayerId(db: Database, playerId: string): Promise<MusicRow | null> {
  const rows = await sqliteOf(db)
    .select()
    .from(music)
    .where(and(eq(music.playerId, playerId), isNull(music.deletedAt)))
    .limit(1)
  return rows[0] ?? null
}

export async function findMusicBySourceAndId(db: Database, source: string, sourceId: string): Promise<MusicRow | null> {
  const rows = await sqliteOf(db)
    .select()
    .from(music)
    .where(and(eq(music.source, source), eq(music.sourceId, sourceId)))
    .limit(1)
  return rows[0] ?? null
}

export async function findMusicByPlayerIds(db: Database, playerIds: readonly string[]): Promise<MusicRow[]> {
  if (playerIds.length === 0) {
    return []
  }
  const conditions = playerIds.map((id) => eq(music.playerId, id))
  const where = conditions.length === 1 ? conditions[0] : or(...conditions)
  return sqliteOf(db)
    .select()
    .from(music)
    .where(and(where, isNull(music.deletedAt)))
}

export async function insertMusic(db: Database, values: NewMusic): Promise<MusicRow> {
  const now = new Date()
  const rows = await sqliteOf(db)
    .insert(music)
    .values({ ...values, createdAt: now, updatedAt: now })
    .returning()
  return rows[0]
}

export async function updateMusic(db: Database, id: number, values: Partial<NewMusic>): Promise<MusicRow | null> {
  const rows = await sqliteOf(db)
    .update(music)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(music.id, id))
    .returning()
  return rows[0] ?? null
}

export async function softDeleteMusic(db: Database, id: number): Promise<MusicRow | null> {
  const now = new Date()
  const rows = await sqliteOf(db)
    .update(music)
    .set({ deletedAt: now, updatedAt: now })
    .where(eq(music.id, id))
    .returning()
  return rows[0] ?? null
}

export async function restoreMusic(
  db: Database,
  id: number,
  values: Pick<NewMusic, 'name' | 'artist' | 'album' | 'lyric' | 'uploaderId'>,
): Promise<MusicRow | null> {
  const now = new Date()
  const rows = await sqliteOf(db)
    .update(music)
    .set({ ...values, deletedAt: null, updatedAt: now })
    .where(eq(music.id, id))
    .returning()
  return rows[0] ?? null
}
