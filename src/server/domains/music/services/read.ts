import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import type { AdminMusicDto, ListMusicInput, ListMusicOutput, PublicMusicMeta } from '@/shared/types/music'

import { toAdminMusicDto } from '@/server/domains/music/projection'
import { safeBuildMusicPublicUrl } from '@/server/domains/music/storage'
import {
  type AdminMusicListFilters,
  countAdminMusic,
  findAdminMusicRowById,
  findMusicByPlayerId,
  listAdminMusicRows,
} from '@/server/infra/db/operations/music'

export async function listMusicForAdmin(db: NodePgDatabase, input: ListMusicInput = {}): Promise<ListMusicOutput> {
  const offset = clampOffset(input.offset)
  const limit = clampLimit(input.limit)

  const filters: AdminMusicListFilters = {
    q: input.q,
    offset,
    limit,
  }

  const [rows, total] = await Promise.all([listAdminMusicRows(db, filters), countAdminMusic(db, { q: input.q })])

  return {
    musics: rows.map((row) => toAdminMusicDto(row, row.uploaderName)),
    total,
    hasMore: offset + rows.length < total,
  }
}

export async function findMusicDtoById(db: NodePgDatabase, id: bigint): Promise<AdminMusicDto | null> {
  const row = await findAdminMusicRowById(db, id)
  if (row === null) {
    return null
  }
  return toAdminMusicDto(row, row.uploaderName)
}

/**
 * Public projection for the SSR `<MusicPlayer />` and the public
 * `GET music.get` route. Returns `null` when the row is missing or
 * soft-deleted so the player can render a no-op placeholder.
 */
export async function getMusicMetaForPlayer(db: NodePgDatabase, playerId: string): Promise<PublicMusicMeta | null> {
  const row = await findMusicByPlayerId(db, playerId)
  if (row === null) {
    return null
  }
  const audioUrl = safeBuildMusicPublicUrl(row.audioStoragePath)
  const coverUrl = safeBuildMusicPublicUrl(row.coverStoragePath)
  if (audioUrl === null || coverUrl === null) {
    return null
  }
  return {
    id: row.playerId,
    name: row.name,
    artist: row.artist,
    album: row.album,
    url: audioUrl,
    pic: coverUrl,
    lyric: row.lyric ?? '',
  }
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
