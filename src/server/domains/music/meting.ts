import { z } from 'zod'

import { ActionFailure } from '@/server/infra/http/errors'
import { getLogger } from '@/server/infra/logger'

import { NeteaseResolver } from './netease-resolver'

// Thin, netease-only wrapper around the inline `NeteaseResolver`. Every
// method returns a Zod-validated payload so an upstream API drift surfaces
// as a clear "Meting 返回异常" error instead of silently corrupting
// downstream business code.

const log = getLogger('music.meting')

// Provider-formatted song shape (after resolver formatting). NOTE: `id`
// and `url_id` can be numbers in the raw upstream response; we coerce
// them at the boundary so the rest of the codebase treats sourceId as a
// string.
const formattedSongSchema = z.object({
  id: z.union([z.number(), z.string()]).transform((v) => String(v)),
  name: z.string(),
  artist: z.array(z.string()),
  album: z.string(),
  pic_id: z.union([z.number(), z.string()]).transform((v) => String(v)),
  url_id: z.union([z.number(), z.string()]).transform((v) => String(v)),
  lyric_id: z.union([z.number(), z.string()]).transform((v) => String(v)),
  source: z.literal('netease'),
})

const urlPayloadSchema = z.object({
  url: z.string(),
  size: z.number().optional(),
  br: z.number().optional(),
})

const lyricPayloadSchema = z.object({
  lyric: z.string().optional(),
  tlyric: z.string().optional(),
})

const picPayloadSchema = z.object({
  url: z.string(),
})

export type MetingFormattedSong = z.infer<typeof formattedSongSchema>

export interface MetingSearchHit {
  source: 'netease'
  sourceId: string
  name: string
  artist: string[]
  album: string
  picId: string
  urlId: string
  lyricId: string
}

function client(): NeteaseResolver {
  // A fresh resolver per call keeps the wrapper stateless.
  return new NeteaseResolver()
}

function parseFormattedJson<T>(raw: unknown, schema: z.ZodType<T>, where: string): T {
  const text = typeof raw === 'string' ? raw : JSON.stringify(raw)
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    log.error('Meting returned non-JSON payload', { where, error, snippet: text.slice(0, 200) })
    throw new ActionFailure(502, '上游音乐服务返回异常，请稍后再试')
  }
  const result = schema.safeParse(parsed)
  if (!result.success) {
    log.error('Meting payload failed schema validation', { where, issues: result.error.issues })
    throw new ActionFailure(502, '上游音乐服务返回异常，请稍后再试')
  }
  return result.data
}

function toHit(song: MetingFormattedSong): MetingSearchHit {
  return {
    source: 'netease',
    sourceId: song.id,
    name: song.name,
    artist: song.artist,
    album: song.album,
    picId: song.pic_id,
    urlId: song.url_id,
    lyricId: song.lyric_id,
  }
}

/** Search netease for songs matching `keyword`. Capped server-side at 30 hits. */
export async function searchSongs(keyword: string, limit = 10): Promise<MetingSearchHit[]> {
  const trimmed = keyword.trim()
  if (trimmed === '') {
    return []
  }
  const safeLimit = Math.min(Math.max(1, Math.floor(limit)), 30)
  const raw = await client().search(trimmed, { limit: safeLimit })
  const songs = parseFormattedJson(raw, z.array(formattedSongSchema), 'search')
  return songs.map(toHit)
}

/** Single-song lookup. Returns `null` when the upstream array is empty. */
export async function getSong(sourceId: string): Promise<MetingSearchHit | null> {
  const raw = await client().song(sourceId)
  const songs = parseFormattedJson(raw, z.array(formattedSongSchema), 'song')
  const first = songs[0]
  return first === undefined ? null : toHit(first)
}

/** Resolve the streaming URL for `urlId`. 320kbps where available. */
export async function getStreamUrl(urlId: string, bitrate = 320): Promise<string> {
  const raw = await client().url(urlId, bitrate)
  const payload = parseFormattedJson(raw, urlPayloadSchema, 'url')
  if (payload.url.trim() === '') {
    throw new ActionFailure(404, '上游未返回可用的音频地址（可能版权受限）')
  }
  return payload.url
}

/** Resolve the LRC lyric text. Returns `null` when the song has none. */
export async function getLyric(lyricId: string): Promise<string | null> {
  const raw = await client().lyric(lyricId)
  const payload = parseFormattedJson(raw, lyricPayloadSchema, 'lyric')
  const text = payload.lyric?.trim() ?? ''
  return text === '' ? null : text
}

/** Resolve the album artwork URL. `size` is the requested side length. */
export async function getCoverUrl(picId: string, size = 300): Promise<string> {
  const raw = await client().pic(picId, size)
  const payload = parseFormattedJson(raw, picPayloadSchema, 'pic')
  if (payload.url.trim() === '') {
    throw new ActionFailure(404, '上游未返回可用的封面地址')
  }
  return payload.url
}

export interface MetingSearchHitWithPreview extends MetingSearchHit {
  /** Streaming URL — short-lived, intentionally not persisted. */
  previewUrl: string
  /** Full-size cover URL — used for the search-result thumbnail. */
  coverUrl: string
}

/**
 * Convenience: search + resolve preview + cover URLs in parallel for
 * each hit. Used by the admin add-music dialog so the search list can
 * render thumbnails and play previews without per-row round-trips.
 *
 * Failures on individual lookups are tolerated: the hit still appears
 * with empty `previewUrl` / `coverUrl` so the admin can decide whether
 * to retry or move on.
 */
export async function searchSongsWithPreview(keyword: string, limit = 10): Promise<MetingSearchHitWithPreview[]> {
  const hits = await searchSongs(keyword, limit)
  return Promise.all(
    hits.map(async (hit) => {
      const [previewUrl, coverUrl] = await Promise.all([
        getStreamUrl(hit.urlId).catch((error: unknown) => {
          log.warn('Preview URL resolution failed', { sourceId: hit.sourceId, error })
          return ''
        }),
        getCoverUrl(hit.picId).catch((error: unknown) => {
          log.warn('Cover URL resolution failed', { sourceId: hit.sourceId, error })
          return ''
        }),
      ])
      return { ...hit, previewUrl, coverUrl }
    }),
  )
}
