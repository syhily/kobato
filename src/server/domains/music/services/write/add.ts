import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import type { ProviderTrack } from '@/server/domains/music/providers/types'
import type { MusicRow, NewMusic } from '@/server/infra/db/types'
import type { AdminMusicDto } from '@/shared/types/music'

import { toAdminMusicDto } from '@/server/domains/music/projection'
import { getProvider } from '@/server/domains/music/providers/registry'
import {
  COVER_JPEG_QUALITY,
  COVER_SIZE,
  downloadBinary,
  generateUniquePlayerId,
  MAX_AUDIO_BYTES,
  MAX_COVER_BYTES,
} from '@/server/domains/music/services/write/shared'
import {
  deleteMusicObject,
  ensureMusicStorageEnabled,
  putMusicAudio,
  putMusicCover,
} from '@/server/domains/music/storage'
import { insertMusic, findMusicBySourceAndId } from '@/server/infra/db/operations/music'
import { DomainError } from '@/server/infra/http/errors'
import { processImageBuffer } from '@/server/infra/image/process'
import { getLogger } from '@/server/infra/logger'

const log = getLogger('music.service')

export interface AddMusicInputs {
  source: string
  sourceId: string
  uploader: { id: bigint; name: string } | null
  /**
   * Optional pre-resolved metadata + asset URLs. The historical-import
   * script preloads this from the legacy
   * `https://assets.example.com/musics/<id>.json` so we don't pay for a full
   * Meting round-trip on import. Missing fields fall through to the
   * Meting wrapper.
   */
  prefill?: AddMusicPrefill
}

export interface AddMusicPrefill {
  name?: string
  artist?: string[]
  album?: string
  audioUrl?: string
  coverUrl?: string
  lyric?: string | null
}

/**
 * Single source of truth for "add this song to the library". Used by
 * the admin add-music dialog action AND the historical-import CLI.
 *
 * The function is idempotent on `(source, sourceId)`: an already-
 * imported song returns its existing row instead of re-uploading,
 * which makes the import script safe to re-run.
 */
export async function addMusic(db: NodePgDatabase, input: AddMusicInputs): Promise<AdminMusicDto> {
  await ensureMusicStorageEnabled()

  // Idempotency: skip the whole upload-and-insert dance if we already
  // imported this song. The caller can decide whether to surface this
  // as "already exists" (UI) or "skip" (importer).
  const existing = await findMusicBySourceAndId(db, input.source, input.sourceId)
  if (existing !== null && existing.deletedAt === null) {
    return toAdminMusicDto({ ...existing, uploaderName: input.uploader?.name ?? null }, input.uploader?.name ?? null)
  }

  // Resolve the canonical track from the provider.
  const provider = getProvider(input.source)
  const track = await provider.getTrack(input.sourceId)
  if (track === null) {
    throw new DomainError('NOT_FOUND', `上游未找到 sourceId=${input.sourceId} 的歌曲`)
  }

  const metadata = mergeMetadata(track, input.prefill)

  const playerId = await generateUniquePlayerId(db)
  const audioStoragePath = `musics/${playerId}.mp3`
  const coverStoragePath = `musics/${playerId}.jpg`

  // Resolve URLs, download binaries, and fetch lyric in parallel.
  const [audioUrl, coverUrl] = await Promise.all([
    input.prefill?.audioUrl ?? provider.resolveAudioUrl(track),
    input.prefill?.coverUrl ?? provider.resolveCoverUrl(track),
  ])

  const [audioBuffer, coverSrcBuffer, lyricText] = await Promise.all([
    downloadBinary(audioUrl, MAX_AUDIO_BYTES, 'audio'),
    downloadBinary(coverUrl, MAX_COVER_BYTES, 'cover'),
    input.prefill?.lyric === undefined ? provider.getLyric(track) : input.prefill.lyric,
  ])

  // Re-encode cover to 300x300 JPEG before uploading.
  let coverProcessed: Buffer
  try {
    const processed = await processImageBuffer({
      buffer: coverSrcBuffer,
      jpegQuality: COVER_JPEG_QUALITY,
      resize: { width: COVER_SIZE, height: COVER_SIZE, fit: 'cover' },
    })
    coverProcessed = processed.buffer
  } catch (error) {
    log.error('Cover image processing failed', { sourceId: input.sourceId, error })
    throw error
  }

  // Upload both assets in parallel.
  await Promise.all([putMusicAudio(audioStoragePath, audioBuffer), putMusicCover(coverStoragePath, coverProcessed)])

  const newRow: NewMusic = {
    source: input.source,
    sourceId: input.sourceId,
    playerId,
    name: metadata.name,
    artist: metadata.artist.join(' / '),
    album: metadata.album,
    audioStoragePath,
    coverStoragePath,
    lyric: lyricText,
    uploaderId: input.uploader?.id ?? null,
  }

  let row: MusicRow
  try {
    row = await insertMusic(db, newRow)
  } catch (error) {
    log.error('Music insert failed; rolling back S3 uploads', {
      sourceId: input.sourceId,
      playerId,
      error,
    })
    await Promise.allSettled([deleteMusicObject(audioStoragePath), deleteMusicObject(coverStoragePath)])
    throw new DomainError('INTERNAL', '音乐元数据写入失败，请稍后重试')
  }

  return toAdminMusicDto(row, input.uploader?.name ?? null)
}

function mergeMetadata(
  track: ProviderTrack,
  prefill: AddMusicPrefill | undefined,
): { name: string; artist: string[]; album: string } {
  const name = pickNonEmpty(prefill?.name, track.name)
  const album = pickNonEmpty(prefill?.album, track.album)
  const artist = prefill?.artist !== undefined && prefill.artist.length > 0 ? prefill.artist : track.artist
  return { name, artist, album }
}

function pickNonEmpty(...values: (string | undefined)[]): string {
  for (const value of values) {
    if (value !== undefined && value.trim() !== '') {
      return value.trim()
    }
  }
  return ''
}
