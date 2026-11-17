import type { AdminMusicDto, ListMusicOutput, PublicMusicMeta } from '@kobato/contracts/music.ts'
import type { Database } from '@kobato/db/database.ts'
import type { MusicRow } from '@kobato/db/types.ts'

import {
  type AdminMusicListFilters,
  countAdminMusic,
  findAdminMusicRowById,
  findMusicByPlayerId,
  findMusicByPlayerIds,
  listAdminMusicRows,
} from '@kobato/db/operations/music.ts'
import { toAdminMusicDto } from '@kobato/server/domains/music/projection.ts'
import { safeResolveAssetUrl } from '@kobato/server/infra/storage/public-url.ts'
import { getBlogSettingsBundleSync } from '@kobato/settings/getters.ts'
import { brandingVersionSuffix } from '@kobato/settings/presentation.ts'

export interface ListMusicInput {
  q?: string
  offset?: number
  limit?: number
  sortBy?: 'createdAt' | 'updatedAt' | 'name' | 'artist' | 'album'
  sortOrder?: 'asc' | 'desc'
}

export async function listMusicForAdmin(db: Database, input: ListMusicInput = {}): Promise<ListMusicOutput> {
  const offset = clampOffset(input.offset)
  const limit = clampLimit(input.limit)

  const filters: AdminMusicListFilters = {
    q: input.q,
    offset,
    limit,
    sortBy: input.sortBy,
    sortOrder: input.sortOrder,
  }

  const [rows, total] = await Promise.all([listAdminMusicRows(db, filters), countAdminMusic(db, { q: input.q })])

  return {
    musics: rows.map((row) => toAdminMusicDto(row, row.uploaderName)),
    total,
    hasMore: offset + rows.length < total,
  }
}

export async function findMusicDtoById(db: Database, id: number): Promise<AdminMusicDto | null> {
  const row = await findAdminMusicRowById(db, id)
  if (row === null) {
    return null
  }
  return toAdminMusicDto(row, row.uploaderName)
}

/**
 * Fallback cover for tracks whose stored cover has no buildable public URL.
 * Served by the default-asset route (`defaultMusicCover` slot — `packages/server/src/domains/assets/services/routes.ts`).
 */
export const DEFAULT_MUSIC_COVER_URL = '/images/default-music-cover.png'

/** The default-cover URL with the slot's `?v=` cache-buster when customized. */
function defaultMusicCoverUrl(): string {
  return `${DEFAULT_MUSIC_COVER_URL}${brandingVersionSuffix(getBlogSettingsBundleSync()?.assets?.branding?.defaultMusicCover)}`
}

/**
 * Row → public projection, the single owner of music URL building. Returns
 * `null` when the audio URL can't be built; a missing cover falls back to the default.
 */
function toPublicMusicMeta(row: MusicRow): PublicMusicMeta | null {
  const audioUrl = safeResolveAssetUrl(row.audioStoragePath)
  if (audioUrl === null) {
    return null
  }
  return {
    id: row.playerId,
    name: row.name,
    artist: row.artist,
    album: row.album,
    url: audioUrl,
    pic: safeResolveAssetUrl(row.coverStoragePath) ?? defaultMusicCoverUrl(),
    lyric: row.lyric ?? '',
  }
}

/**
 * Public projection for the SSR `<MusicPlayer />` and `GET music.get`.
 * Returns `null` when the row is missing or soft-deleted.
 */
export async function getMusicMetaForPlayer(db: Database, playerId: string): Promise<PublicMusicMeta | null> {
  const row = await findMusicByPlayerId(db, playerId)
  return row === null ? null : toPublicMusicMeta(row)
}

/**
 * Batch variant of `getMusicMetaForPlayer` — one query per page. Callers
 * wire it into the Lexical embed seam (`@/server/domains/content/services/lexical/embeds`).
 */
export async function getPublicMusicMetasByIds(
  db: Database,
  playerIds: readonly string[],
): Promise<Map<string, PublicMusicMeta>> {
  const rows = await findMusicByPlayerIds(db, playerIds)
  const metas = new Map<string, PublicMusicMeta>()
  for (const row of rows) {
    const meta = toPublicMusicMeta(row)
    if (meta !== null) {
      metas.set(row.playerId, meta)
    }
  }
  return metas
}

function clampOffset(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value) || value < 0) {
    return 0
  }
  return Math.floor(value)
}

function clampLimit(value: number | undefined): number {
  const fallback = 20
  if (value === undefined || !Number.isFinite(value)) {
    return fallback
  }
  return Math.max(1, Math.min(100, Math.floor(value)))
}
