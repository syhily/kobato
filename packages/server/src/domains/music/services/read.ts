import type { Database } from '@kobato/server/infra/db/database'
import type { MusicRow } from '@kobato/server/infra/db/types'
import type { AdminMusicDto, ListMusicOutput, PublicMusicMeta } from '@kobato/shared/contracts/music'
import type { ListMusicInput } from '@kobato/shared/types/music'

import { toAdminMusicDto } from '@kobato/server/domains/music/projection'
import {
  type AdminMusicListFilters,
  countAdminMusic,
  findAdminMusicRowById,
  findMusicByPlayerId,
  findMusicByPlayerIds,
  listAdminMusicRows,
} from '@kobato/server/infra/db/operations/music'
import { safeResolveAssetUrl } from '@kobato/server/infra/storage/public-url'

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
 * Fallback cover for tracks whose stored cover has no buildable public URL
 * (e.g. an S3 row after the CDN base was unset). Served by the bundled
 * default-asset route — see `src/server/domains/assets/services/routes.ts`
 * (`/images/default-music-cover.png` → the `defaultMusicCover` slot).
 */
export const DEFAULT_MUSIC_COVER_URL = '/images/default-music-cover.png'

/**
 * Row → public projection, the single owner of music URL building. Returns
 * `null` only when the audio URL can't be built — an unplayable track stays
 * hidden. A missing cover is not fatal: it falls back to the bundled default
 * vinyl image so the track stays playable (unplayable ≠ coverless).
 */
function toPublicMusicMeta(row: MusicRow): PublicMusicMeta | null {
  const audioUrl = safeResolveAssetUrl(row.storageDriver, row.audioStoragePath)
  if (audioUrl === null) {
    return null
  }
  return {
    id: row.playerId,
    name: row.name,
    artist: row.artist,
    album: row.album,
    url: audioUrl,
    pic: safeResolveAssetUrl(row.storageDriver, row.coverStoragePath) ?? DEFAULT_MUSIC_COVER_URL,
    lyric: row.lyric ?? '',
  }
}

/**
 * Public projection for the SSR `<MusicPlayer />` and the public
 * `GET music.get` route. Returns `null` when the row is missing or
 * soft-deleted so the player can render a no-op placeholder.
 */
export async function getMusicMetaForPlayer(db: Database, playerId: string): Promise<PublicMusicMeta | null> {
  const row = await findMusicByPlayerId(db, playerId)
  return row === null ? null : toPublicMusicMeta(row)
}

/**
 * Batch variant of `getMusicMetaForPlayer` — one query regardless of how
 * many players a page embeds. Callers wire this into the PT-owned embed
 * seam (`@kobato/server/domains/lexical/embeds`) so the body dialect never
 * imports this domain.
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
