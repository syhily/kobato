import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { and, count, desc, eq, isNull, or, type SQL } from 'drizzle-orm'

import type { MusicRow, NewMusic } from '@/server/infra/db/types'

import { music } from '@/server/infra/db/schema/media'
import { user } from '@/server/infra/db/schema/user'
import { ilikeEscape } from '@/shared/utils/escape-like'

export interface AdminMusicListFilters {
  q?: string
  offset?: number
  limit?: number
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

const ADMIN_MUSIC_WITH_UPLOADER_COLUMNS = {
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
  lyric: music.lyric,
  uploaderId: music.uploaderId,
  uploaderName: user.name,
} as const

function buildAdminMusicWhere(filters: AdminMusicListFilters): SQL | undefined {
  const conditions: SQL[] = []

  if (!filters.includeDeleted) {
    conditions.push(isNull(music.deletedAt))
  }

  if (filters.q && filters.q.trim() !== '') {
    const q = filters.q.trim()
    const search = or(
      ilikeEscape(music.name, q),
      ilikeEscape(music.artist, q),
      ilikeEscape(music.album, q),
      ilikeEscape(music.sourceId, q),
      ilikeEscape(music.playerId, q),
    )
    if (search) {
      conditions.push(search)
    }
  }

  if (conditions.length === 0) {
    return undefined
  }
  if (conditions.length === 1) {
    return conditions[0]
  }
  return and(...conditions)
}

export async function listAdminMusicRows(
  db: NodePgDatabase,
  filters: AdminMusicListFilters = {},
): Promise<AdminMusicRowWithUploader[]> {
  const where = buildAdminMusicWhere(filters)
  const baseQuery = db
    .select(ADMIN_MUSIC_WITH_UPLOADER_COLUMNS)
    .from(music)
    .leftJoin(user, eq(user.id, music.uploaderId))

  let q = where ? baseQuery.where(where).orderBy(desc(music.createdAt)) : baseQuery.orderBy(desc(music.createdAt))
  if (filters.limit !== undefined) {
    q = q.limit(filters.limit) as typeof q
  }
  if (filters.offset !== undefined && filters.offset > 0) {
    q = q.offset(filters.offset) as typeof q
  }
  return q
}

export async function findAdminMusicRowById(db: NodePgDatabase, id: bigint): Promise<AdminMusicRowWithUploader | null> {
  const rows = await db
    .select(ADMIN_MUSIC_WITH_UPLOADER_COLUMNS)
    .from(music)
    .leftJoin(user, eq(user.id, music.uploaderId))
    .where(eq(music.id, id))
    .limit(1)
  return rows[0] ?? null
}

export async function countAdminMusic(db: NodePgDatabase, filters: AdminMusicListFilters = {}): Promise<number> {
  const where = buildAdminMusicWhere(filters)
  const rows = where
    ? await db.select({ value: count() }).from(music).where(where)
    : await db.select({ value: count() }).from(music)
  return rows[0]?.value ?? 0
}

export async function findMusicById(db: NodePgDatabase, id: bigint): Promise<MusicRow | null> {
  const rows = await db.select().from(music).where(eq(music.id, id)).limit(1)
  return rows[0] ?? null
}

/**
 * Public lookup keyed on the opaque `playerId` written into MDX. Skips
 * soft-deleted rows so a removed song renders the player as a no-op
 * placeholder instead of surfacing a 404 to the reader.
 */
export async function findMusicByPlayerId(db: NodePgDatabase, playerId: string): Promise<MusicRow | null> {
  const rows = await db
    .select()
    .from(music)
    .where(and(eq(music.playerId, playerId), isNull(music.deletedAt)))
    .limit(1)
  return rows[0] ?? null
}

/** Idempotency helper for the historical-import path. */
export async function findMusicBySourceAndId(
  db: NodePgDatabase,
  source: string,
  sourceId: string,
): Promise<MusicRow | null> {
  const rows = await db
    .select()
    .from(music)
    .where(and(eq(music.source, source), eq(music.sourceId, sourceId)))
    .limit(1)
  return rows[0] ?? null
}

export async function findMusicByPlayerIds(db: NodePgDatabase, playerIds: readonly string[]): Promise<MusicRow[]> {
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

export async function insertMusic(db: NodePgDatabase, values: NewMusic): Promise<MusicRow> {
  const now = new Date()
  const rows = await db
    .insert(music)
    .values({ ...values, createdAt: now, updatedAt: now })
    .returning()
  return rows[0]
}

export async function updateMusic(db: NodePgDatabase, id: bigint, values: Partial<NewMusic>): Promise<MusicRow | null> {
  const rows = await db
    .update(music)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(music.id, id))
    .returning()
  return rows[0] ?? null
}

export async function softDeleteMusic(db: NodePgDatabase, id: bigint): Promise<MusicRow | null> {
  const now = new Date()
  const rows = await db.update(music).set({ deletedAt: now, updatedAt: now }).where(eq(music.id, id)).returning()
  return rows[0] ?? null
}
