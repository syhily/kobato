import type { AdminMusicDto, ListMusicOutput, PublicMusicMeta } from '@kobato/api/contracts/music'
import type { Database } from '@kobato/db/database'
import type { MusicRow } from '@kobato/db/types'

import {
  type AdminMusicListFilters,
  countAdminMusic,
  findAdminMusicRowById,
  findMusicByPlayerId,
  findMusicByPlayerIds,
  listAdminMusicRows,
} from '@kobato/db/operations/music'
import { toAdminMusicDto } from '@kobato/server/domains/music/projection'
import { safeResolveAssetUrl } from '@kobato/server/infra/storage/public-url'
import { getBlogSettingsBundleSync } from '@kobato/settings/getters'
import { brandingVersionSuffix } from '@kobato/settings/presentation'

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

export const DEFAULT_MUSIC_COVER_URL = '/images/default-music-cover.png'

function defaultMusicCoverUrl(): string {
  return `${DEFAULT_MUSIC_COVER_URL}${brandingVersionSuffix(getBlogSettingsBundleSync()?.assets?.branding?.defaultMusicCover)}`
}

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

export async function getMusicMetaForPlayer(db: Database, playerId: string): Promise<PublicMusicMeta | null> {
  const row = await findMusicByPlayerId(db, playerId)
  return row === null ? null : toPublicMusicMeta(row)
}

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
