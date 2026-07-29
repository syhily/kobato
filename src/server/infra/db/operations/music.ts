import { and, asc, count, desc, eq, isNull, or, type SQL } from 'drizzle-orm'

import type { Database } from '@/server/infra/db/database'
import type { MusicRow, NewMusic } from '@/server/infra/db/types'

import { likeEscape } from '@/server/infra/db/like-escape'
import { applyPage, assembleWhere, withUploader } from '@/server/infra/db/operations/admin-list'
import { music } from '@/server/infra/db/schema/media'

export interface AdminMusicListFilters {
  q?: string
  offset?: number
  limit?: number
  sortBy?: 'createdAt' | 'updatedAt' | 'name' | 'artist' | 'album'
  sortOrder?: 'asc' | 'desc'
  /** Default `false`: list view hides soft-deleted rows. */
  includeDeleted?: boolean
}

/**
 * Row projection used by the admin list endpoint. Same approach as
 * `AdminImageRowWithUploader`: project the `music` columns verbatim
 * plus a LEFT JOIN against `user` for the uploader display name. A
 * hard-deleted user (or a NULL `uploader_id` on legacy rows) keeps
 * the music row visible with `uploaderName === null`.
 */
export interface AdminMusicRowWithUploader extends MusicRow {
  uploaderName: string | null
}

// Entity-specific column selection for the admin-side
// `music LEFT JOIN user` projection; `withUploader()` appends
// `uploaderName` and owns the join plus the single-row refetch.
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

// Entity-specific filter→SQL mapping for the admin music list. The
// conditions-array → `WHERE` assembly is shared with the other admin
// lists via `assembleWhere()`.
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
    ? await db.select({ value: count() }).from(music).where(where)
    : await db.select({ value: count() }).from(music)
  return rows[0]?.value ?? 0
}

export async function findMusicById(db: Database, id: number): Promise<MusicRow | null> {
  const rows = await db.select().from(music).where(eq(music.id, id)).limit(1)
  return rows[0] ?? null
}

/**
 * Public lookup keyed on the opaque `playerId` stored in `musicPlayer`
 * PortableText blocks. Skips soft-deleted rows so a removed song renders
 * the player as a no-op placeholder instead of surfacing a 404 to the
 * reader.
 */
export async function findMusicByPlayerId(db: Database, playerId: string): Promise<MusicRow | null> {
  const rows = await db
    .select()
    .from(music)
    .where(and(eq(music.playerId, playerId), isNull(music.deletedAt)))
    .limit(1)
  return rows[0] ?? null
}

/** Idempotency helper for the historical-import path. */
export async function findMusicBySourceAndId(db: Database, source: string, sourceId: string): Promise<MusicRow | null> {
  const rows = await db
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
  return db
    .select()
    .from(music)
    .where(and(where, isNull(music.deletedAt)))
}

export async function insertMusic(db: Database, values: NewMusic): Promise<MusicRow> {
  const now = new Date()
  const rows = await db
    .insert(music)
    .values({ ...values, createdAt: now, updatedAt: now })
    .returning()
  return rows[0]
}

export async function updateMusic(db: Database, id: number, values: Partial<NewMusic>): Promise<MusicRow | null> {
  const rows = await db
    .update(music)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(music.id, id))
    .returning()
  return rows[0] ?? null
}

export async function softDeleteMusic(db: Database, id: number): Promise<MusicRow | null> {
  const now = new Date()
  const rows = await db.update(music).set({ deletedAt: now, updatedAt: now }).where(eq(music.id, id)).returning()
  return rows[0] ?? null
}
