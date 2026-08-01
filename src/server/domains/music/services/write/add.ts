import type { ProviderTrack } from '@/server/domains/music/providers/types'
import type { Database } from '@/server/infra/db/database'
import type { MusicRow, NewMusic } from '@/server/infra/db/types'
import type { StorageDriver } from '@/shared/config/types'
import type { AdminMusicDto } from '@/shared/contracts/music'

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
import { findMusicById, findMusicBySourceAndId, insertMusic, restoreMusic } from '@/server/infra/db/operations/music'
import { DomainError } from '@/server/infra/http/errors'
import { processImageBuffer } from '@/server/infra/image/process'
import { getLogger } from '@/server/infra/logger'
import { activeBackend, backendFor } from '@/server/infra/storage/registry'

const log = getLogger('music.service')

// Ownership-aware restore rollback (fix-review): a concurrent re-add of
// the same song restores the SAME soft-deleted row — restoreMusic has no
// deletedAt guard, so both writers can pass it; when this one then fails
// on an independent database error, the row (and the storage paths it
// still claims) may already be live again under the winner. Deleting the
// objects would orphan that live row — only delete when no row claims
// the paths. A failed ownership check also skips the delete: an orphaned
// object is recoverable, an orphaned live row is not. Same shape as the
// image upload's `deleteObjectUnlessClaimed`.
async function deleteRestoredObjectsUnlessClaimed(
  db: Database,
  rowId: number,
  driver: StorageDriver,
  audioStoragePath: string,
  coverStoragePath: string,
): Promise<void> {
  const claimant = await findMusicById(db, rowId).catch(() => null)
  if (
    claimant !== null &&
    claimant.audioStoragePath === audioStoragePath &&
    claimant.coverStoragePath === coverStoragePath
  ) {
    return
  }
  await Promise.allSettled([backendFor(driver).delete(audioStoragePath), backendFor(driver).delete(coverStoragePath)])
}

export interface AddMusicInputs {
  source: string
  sourceId: string
  uploader: { id: number; name: string } | null
  /**
   * Optional pre-resolved metadata + asset URLs. The historical-import
   * script preloads this from the legacy assets JSON so it skips the
   * Meting round-trip; missing fields fall through to the provider.
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
 * Idempotent on `(source, sourceId)`: an already-imported song returns
 * its existing row instead of re-uploading, so the import script is
 * safe to re-run. A soft-deleted row still occupies UNIQUE(source,
 * source_id), so re-adding RESTORES it in place — same row, playerId,
 * and storage paths; fresh metadata and re-uploaded assets.
 */
export async function addMusic(db: Database, input: AddMusicInputs): Promise<AdminMusicDto> {
  // Idempotency: skip the upload-and-insert dance if we already imported
  // this song. The caller decides whether to surface "already exists" (UI)
  // or "skip" (importer).
  const existing = await findMusicBySourceAndId(db, input.source, input.sourceId)
  if (existing !== null && existing.deletedAt === null) {
    return toAdminMusicDto({ ...existing, uploaderName: input.uploader?.name ?? null }, input.uploader?.name ?? null)
  }

  // A soft-deleted match means restore, not insert: the row still holds the
  // unique key, so a plain INSERT would 500. Restoring in place also revives
  // the playerId already embedded in posts — the delete is fully undone.
  const restoring = existing

  // Resolve the canonical track from the provider.
  const provider = getProvider(input.source)
  const track = await provider.getTrack(input.sourceId)
  if (track === null) {
    throw new DomainError('NOT_FOUND', `上游未找到 sourceId=${input.sourceId} 的歌曲`)
  }

  const metadata = mergeMetadata(track, input.prefill)

  // On restore the row keeps its playerId and storage paths — no new
  // playerId draw, no unique-key churn.
  const playerId = restoring?.playerId ?? (await generateUniquePlayerId(db))
  const audioStoragePath = restoring?.audioStoragePath ?? `musics/${playerId}.mp3`
  const coverStoragePath = restoring?.coverStoragePath ?? `musics/${playerId}.jpg`

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

  // Upload both assets in parallel. A fresh add resolves the active backend
  // once so audio and cover land on the same driver; a restore re-uploads to
  // the row's persisted driver (deleteMusic removed the objects there) so a
  // local↔S3 switch while deleted can't strand the assets on the wrong
  // backend. The driver targets the rollback deletes below.
  const { backend, driver } = restoring
    ? { backend: backendFor(restoring.storageDriver), driver: restoring.storageDriver }
    : activeBackend()
  await Promise.all([
    backend.put({ key: audioStoragePath, body: audioBuffer, contentType: 'audio/mpeg', visibility: 'public' }),
    backend.put({ key: coverStoragePath, body: coverProcessed, contentType: 'image/jpeg', visibility: 'public' }),
  ])

  const newRow: NewMusic = {
    source: input.source,
    sourceId: input.sourceId,
    playerId,
    name: metadata.name,
    artist: metadata.artist.join(' / '),
    album: metadata.album,
    audioStoragePath,
    coverStoragePath,
    storageDriver: driver,
    lyric: lyricText,
    uploaderId: input.uploader?.id ?? null,
  }

  let row: MusicRow
  try {
    if (restoring) {
      const restored = await restoreMusic(db, restoring.id, {
        name: newRow.name,
        artist: newRow.artist,
        album: newRow.album,
        lyric: newRow.lyric,
        uploaderId: newRow.uploaderId,
      })
      if (restored === null) {
        throw new Error(`restore target vanished: music id=${restoring.id}`)
      }
      row = restored
    } else {
      row = await insertMusic(db, newRow)
    }
  } catch (error) {
    log.error('Music write failed; rolling back uploads', {
      sourceId: input.sourceId,
      playerId,
      driver,
      error,
    })
    await (restoring
      ? deleteRestoredObjectsUnlessClaimed(db, restoring.id, driver, audioStoragePath, coverStoragePath)
      : Promise.allSettled([backendFor(driver).delete(audioStoragePath), backendFor(driver).delete(coverStoragePath)]))
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
