import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { randomBytes } from 'node:crypto'

import type { MusicRow, NewMusic } from '@/server/infra/db/types'
import type { AdminMusicDto } from '@/shared/types/music'

import { type Role } from '@/server/domains/auth/rbac'
import {
  getCoverUrl,
  getLyric,
  getSong,
  getStreamUrl,
  type MetingSearchHit as InternalMetingHit,
} from '@/server/domains/music/meting'
import { toAdminMusicDto } from '@/server/domains/music/projection'
import {
  deleteMusicObject,
  ensureMusicStorageEnabled,
  putMusicAudio,
  putMusicCover,
} from '@/server/domains/music/storage'
import {
  findAdminMusicRowById,
  findMusicById,
  findMusicByPlayerId,
  findMusicBySourceAndId,
  insertMusic,
  softDeleteMusic,
  updateMusic,
} from '@/server/infra/db/operations/music'
import { DomainError, ErrorMessages } from '@/server/infra/http/errors'
import { processImageBuffer } from '@/server/infra/image/process'
import { getLogger } from '@/server/infra/logger'

const log = getLogger('music.service')

// `[a-z0-9]{16}` is enough entropy for 80 bits — collisions are
// astronomically unlikely against the small music corpus, but we
// still retry on a unique-key violation just to be defensive.
const PLAYER_ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'
function generatePlayerId(): string {
  const bytes = randomBytes(16)
  let id = ''
  for (let i = 0; i < 16; i++) {
    id += PLAYER_ID_ALPHABET[bytes[i] % PLAYER_ID_ALPHABET.length]
  }
  return id
}
const PLAYER_ID_RETRY_LIMIT = 5

const MAX_AUDIO_BYTES = 25 * 1024 * 1024
const MAX_COVER_BYTES = 5 * 1024 * 1024
const COVER_SIZE = 300
const COVER_JPEG_QUALITY = 85

export interface AddMusicInputs {
  source: 'netease'
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

  // Resolve the canonical Meting hit. Even when the importer supplies
  // a prefill we still need the upstream id triplet (pic_id, url_id,
  // lyric_id) to be able to fall back when a prefilled URL 404s.
  const hit = await getSong(input.sourceId)
  if (hit === null) {
    throw new DomainError('NOT_FOUND', `上游未找到 sourceId=${input.sourceId} 的歌曲`)
  }

  const metadata = mergeMetadata(hit, input.prefill)

  const playerId = await generateUniquePlayerId(db)
  const audioStoragePath = `musics/${playerId}.mp3`
  const coverStoragePath = `musics/${playerId}.jpg`

  // Resolve URLs, download binaries, and fetch lyric in parallel.
  const [audioUrl, coverUrl] = await Promise.all([
    input.prefill?.audioUrl ?? getStreamUrl(hit.urlId),
    input.prefill?.coverUrl ?? getCoverUrl(hit.picId, COVER_SIZE),
  ])

  const [audioBuffer, coverSrcBuffer, lyricText] = await Promise.all([
    downloadBinary(audioUrl, MAX_AUDIO_BYTES, 'audio'),
    downloadBinary(coverUrl, MAX_COVER_BYTES, 'cover'),
    input.prefill?.lyric === undefined ? getLyric(hit.lyricId) : input.prefill.lyric,
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

export interface UpdateMusicMetadataInputs {
  id: bigint
  name: string
  artist: string[]
  album: string
  /** `null` clears the stored lyric (matches the "no upstream lyric" case). */
  lyric: string | null
}

/**
 * Metadata-only edit for the admin UI. Provider id triplet
 * (`source`, `sourceId`, `playerId`), audio/cover storage paths,
 * uploader, and timestamps are intentionally untouched — the
 * upload pipeline owns those, and they are how MDX references the
 * row. `artist[]` is packed back to the historical
 * `'Artist A / Artist B'` row representation; the public
 * projection unpacks it again on read.
 */
export interface MusicViewerContext {
  userId: string
  role: Role
}

export async function updateMusicMetadata(
  db: NodePgDatabase,
  input: UpdateMusicMetadataInputs,
  viewer?: MusicViewerContext,
): Promise<AdminMusicDto> {
  const existing = await findMusicById(db, input.id)
  if (existing === null || existing.deletedAt !== null) {
    throw new DomainError('NOT_FOUND', '音乐不存在')
  }
  if (viewer && viewer.role !== 'admin' && existing.uploaderId?.toString() !== viewer.userId) {
    throw new DomainError('NOT_FOUND', ErrorMessages.NOT_FOUND)
  }

  const updated = await updateMusic(db, input.id, {
    name: input.name,
    artist: input.artist.join(' / '),
    album: input.album,
    lyric: input.lyric,
  })
  if (updated === null) {
    throw new DomainError('NOT_FOUND', '音乐不存在')
  }

  // Re-fetch through the admin projection so the response carries
  // the joined `uploaderName` instead of forcing the caller to
  // re-derive it.
  const projected = await findAdminMusicRowById(db, input.id)
  if (projected === null) {
    throw new DomainError('NOT_FOUND', '音乐不存在')
  }
  return toAdminMusicDto(projected, projected.uploaderName)
}

export async function deleteMusic(db: NodePgDatabase, id: bigint, viewer?: MusicViewerContext): Promise<void> {
  const existing = await findMusicById(db, id)
  if (existing === null) {
    throw new DomainError('NOT_FOUND', '音乐不存在')
  }
  if (viewer && viewer.role !== 'admin' && existing.uploaderId?.toString() !== viewer.userId) {
    throw new DomainError('NOT_FOUND', ErrorMessages.NOT_FOUND)
  }

  // Mirror the image library: try S3 best-effort, always proceed to
  // DB soft-delete so the admin table doesn't keep showing a "missing"
  // row when the delete only fails on the S3 leg.
  await Promise.allSettled([deleteMusicObject(existing.audioStoragePath), deleteMusicObject(existing.coverStoragePath)])

  const deleted = await softDeleteMusic(db, id)
  if (deleted === null) {
    throw new DomainError('NOT_FOUND', '音乐不存在')
  }
}

function mergeMetadata(
  hit: InternalMetingHit,
  prefill: AddMusicPrefill | undefined,
): { name: string; artist: string[]; album: string } {
  const name = pickNonEmpty(prefill?.name, hit.name)
  const album = pickNonEmpty(prefill?.album, hit.album)
  const artist = prefill?.artist !== undefined && prefill.artist.length > 0 ? prefill.artist : hit.artist
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

async function generateUniquePlayerId(db: NodePgDatabase): Promise<string> {
  for (let attempt = 0; attempt < PLAYER_ID_RETRY_LIMIT; attempt += 1) {
    const candidate = generatePlayerId()
    const collision = await findMusicByPlayerId(db, candidate)
    if (collision === null) {
      return candidate
    }
    log.warn('playerId collision; retrying', { candidate, attempt })
  }
  throw new DomainError('INTERNAL', 'playerId 生成失败：连续 5 次冲突')
}

async function downloadBinary(url: string, maxBytes: number, what: 'audio' | 'cover'): Promise<Buffer> {
  let response: Response
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(30_000),
      headers: {
        // netease and friends often blacklist the default Node user
        // agent for direct CDN downloads; spoof a stock browser UA so
        // we land on the regular CDN path.
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
      },
    })
  } catch (error) {
    log.error('Music asset fetch failed', { url, what, error })
    throw new DomainError('INTERNAL', `${what === 'audio' ? '下载音频' : '下载封面'}失败，请稍后再试`)
  }
  if (!response.ok) {
    log.error('Music asset fetch returned non-2xx', { url, what, status: response.status })
    throw new DomainError('INTERNAL', `${what === 'audio' ? '下载音频' : '下载封面'}失败：${response.status}`)
  }

  const length = response.headers.get('content-length')
  if (length !== null) {
    const expected = Number.parseInt(length, 10)
    if (Number.isFinite(expected) && expected > maxBytes) {
      throw new DomainError('BAD_REQUEST', `${what === 'audio' ? '音频' : '封面'}体积超过上限`)
    }
  }

  const arrayBuf = await response.arrayBuffer()
  if (arrayBuf.byteLength > maxBytes) {
    throw new DomainError('BAD_REQUEST', `${what === 'audio' ? '音频' : '封面'}体积超过上限`)
  }
  return Buffer.from(arrayBuf)
}
