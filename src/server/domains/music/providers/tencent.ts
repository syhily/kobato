/* oxlint-disable typescript/no-unsafe-type-assertion */
import { z } from 'zod'

import type { MusicProvider, ProviderSearchHit, ProviderTrack } from '@/server/domains/music/providers/types'

import { ActionFailure } from '@/server/infra/http/errors'
import { getLogger } from '@/server/infra/logger'

const log = getLogger('music.tencent')

// ── HTTP helpers ────────────────────────────────────────────────────────────

const TENCENT_HEADERS: Record<string, string> = {
  Referer: 'http://y.qq.com',
  Cookie:
    'pgv_pvi=22038528; pgv_si=s3156287488; pgv_pvid=5535248600; yplayer_open=1; ts_last=y.qq.com/portal/player.html; ts_uid=4847550686; yq_index=0; qqmusic_fromtag=66; player_exist=1',
  'User-Agent': 'QQ%E9%9F%B3%E4%B9%90/54409 CFNetwork/901.1 Darwin/17.6.0 (x86_64)',
  Accept: '*/*',
  'Accept-Language': 'zh-CN,zh;q=0.8,gl;q=0.6,zh-TW;q=0.4',
  Connection: 'keep-alive',
  'Content-Type': 'application/x-www-form-urlencoded',
}

async function tencentGet(url: string, params: Record<string, string>): Promise<unknown> {
  const qs = new URLSearchParams(params).toString()
  const fullUrl = `${url}?${qs}`
  const res = await fetch(fullUrl, {
    method: 'GET',
    headers: TENCENT_HEADERS,
    signal: AbortSignal.timeout(30000),
  })
  if (!res.ok) {
    throw new Error(`Tencent API returned ${res.status} ${res.statusText}`)
  }
  return res.json()
}

// ── HTML entity decoding ────────────────────────────────────────────────────

const ENTITY_MAP: Record<string, string> = {
  '&apos;': "'",
  '&quot;': '"',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&nbsp;': ' ',
}

export function decodeHtmlEntities(text: string): string {
  if (!text) {
    return text
  }
  let decoded = text
  for (const [entity, char] of Object.entries(ENTITY_MAP)) {
    decoded = decoded.replace(new RegExp(entity, 'g'), char)
  }
  // Decimal entities &#39;
  decoded = decoded.replace(/&#(\d+);/g, (_match, dec: string) => String.fromCharCode(Number.parseInt(dec, 10)))
  // Hex entities &#x27;
  decoded = decoded.replace(/&#x([0-9a-fA-F]+);/g, (_match, hex: string) =>
    String.fromCharCode(Number.parseInt(hex, 16)),
  )
  return decoded
}

// ── Raw song parsing ───────────────────────────────────────────────────────

interface RawTencentSinger {
  name: string
}

interface RawTencentAlbum {
  title: string
  mid: string
}

interface RawTencentFile {
  media_mid: string
  size_flac?: number
  size_320mp3?: number
  size_192aac?: number
  size_128mp3?: number
  size_96aac?: number
  size_48aac?: number
  size_24aac?: number
}

interface RawTencentSong {
  mid: string
  name: string
  singer: RawTencentSinger[]
  album: RawTencentAlbum
  file: RawTencentFile
  type: number
}

function toTrack(song: RawTencentSong): ProviderTrack {
  return {
    source: 'tencent',
    sourceId: song.mid,
    name: song.name,
    artist: song.singer.map((s) => s.name),
    album: song.album.title.trim(),
    picId: song.album.mid,
    urlId: song.mid,
    lyricId: song.mid,
  }
}

// ── Zod schemas ─────────────────────────────────────────────────────────────

const searchResponseSchema = z
  .object({
    data: z
      .object({
        song: z
          .object({
            list: z.array(z.any()),
          })
          .optional(),
      })
      .optional(),
  })
  .loose()

const songDetailResponseSchema = z
  .object({
    data: z.array(z.any()).optional(),
  })
  .loose()

// ── Quality map for URL resolution ─────────────────────────────────────────

const QUALITY_MAP: Array<[keyof RawTencentFile, number, string, string]> = [
  ['size_flac', 999, 'F000', 'flac'],
  ['size_320mp3', 320, 'M800', 'mp3'],
  ['size_192aac', 192, 'C600', 'm4a'],
  ['size_128mp3', 128, 'M500', 'mp3'],
  ['size_96aac', 96, 'C400', 'm4a'],
  ['size_48aac', 48, 'C200', 'm4a'],
  ['size_24aac', 24, 'C100', 'm4a'],
]

// ── Provider implementation ─────────────────────────────────────────────────

export const tencentProvider: MusicProvider = {
  source: 'tencent',

  async search(keyword: string, limit: number, offset?: number): Promise<ProviderSearchHit[]> {
    const trimmed = keyword.trim()
    if (trimmed === '') {
      return []
    }

    const safeLimit = Math.min(Math.max(1, Math.floor(limit)), 30)
    const page = Math.floor((offset ?? 0) / safeLimit) + 1

    const res = await tencentGet('https://c.y.qq.com/soso/fcgi-bin/client_search_cp', {
      format: 'json',
      w: trimmed,
      n: String(safeLimit),
      p: String(page),
      aggr: '1',
      lossless: '1',
      cr: '1',
      new_json: '1',
    })

    const parsed = searchResponseSchema.safeParse(res)
    if (!parsed.success) {
      log.error('Tencent search response failed schema validation', { issues: parsed.error.issues })
      throw new ActionFailure(502, '上游音乐服务返回异常，请稍后再试')
    }

    const songs = (parsed.data.data?.song?.list ?? []) as RawTencentSong[]
    const tracks = songs.map(toTrack)

    // Resolve preview URLs and cover URLs for each hit.
    return Promise.all(
      tracks.map(async (track) => {
        const [previewUrl, coverUrl] = await Promise.all([
          tencentProvider.resolveAudioUrl(track).catch((error: unknown) => {
            log.warn('Preview URL resolution failed', { sourceId: track.sourceId, error })
            return ''
          }),
          tencentProvider.resolveCoverUrl(track).catch((error: unknown) => {
            log.warn('Cover URL resolution failed', { sourceId: track.sourceId, error })
            return ''
          }),
        ])
        return {
          source: track.source,
          sourceId: track.sourceId,
          name: track.name,
          artist: track.artist,
          album: track.album,
          coverUrl,
          previewUrl,
        }
      }),
    )
  },

  async getTrack(sourceId: string): Promise<ProviderTrack | null> {
    const res = await tencentGet('https://c.y.qq.com/v8/fcg-bin/fcg_play_single_song.fcg', {
      songmid: sourceId,
      platform: 'yqq',
      format: 'json',
    })

    const parsed = songDetailResponseSchema.safeParse(res)
    if (!parsed.success) {
      log.error('Tencent song detail response failed schema validation', { issues: parsed.error.issues })
      throw new ActionFailure(502, '上游音乐服务返回异常，请稍后再试')
    }

    const songs = (parsed.data.data ?? []) as RawTencentSong[]
    const first = songs[0]
    return first ? toTrack(first) : null
  },

  async resolveAudioUrl(track: ProviderTrack): Promise<string> {
    // Step 1: Get song detail to obtain file info
    const detailRes = await tencentGet('https://c.y.qq.com/v8/fcg-bin/fcg_play_single_song.fcg', {
      songmid: track.urlId,
      platform: 'yqq',
      format: 'json',
    })

    const detailParsed = songDetailResponseSchema.safeParse(detailRes)
    if (!detailParsed.success || !detailParsed.data.data?.length) {
      throw new ActionFailure(404, '上游未返回歌曲详情')
    }

    const songData = detailParsed.data.data[0] as RawTencentSong
    const guid = Math.floor(Math.random() * 1_000_000_000)

    // Step 2: Request vkey from the vkey server
    const payload = {
      req_0: {
        module: 'vkey.GetVkeyServer',
        method: 'CgiGetVkey',
        param: {
          guid: String(guid),
          songmid: QUALITY_MAP.map(() => songData.mid),
          filename: QUALITY_MAP.map(([, , prefix, ext]) => `${prefix}${songData.file.media_mid}.${ext}`),
          songtype: QUALITY_MAP.map(() => songData.type),
          uin: '0',
          loginflag: 1,
          platform: '20',
        },
      },
    }

    const vkeyRes = await tencentGet('https://u.y.qq.com/cgi-bin/musicu.fcg', {
      format: 'json',
      platform: 'yqq.json',
      needNewCode: '0',
      data: JSON.stringify(payload),
    })

    const typed = vkeyRes as Record<string, unknown>
    const req0 = typed.req_0 as Record<string, unknown> | undefined
    const req0Data = req0?.data as Record<string, unknown> | undefined
    const midurlinfo = req0Data?.midurlinfo as Array<Record<string, string>> | undefined
    const sip = req0Data?.sip as string[] | undefined

    if (!midurlinfo || !sip) {
      throw new ActionFailure(404, '上游未返回音频地址（vkey 解析失败）')
    }

    // Step 3: Pick the best available quality
    for (let i = 0; i < QUALITY_MAP.length; i++) {
      const [sizeKey] = QUALITY_MAP[i]
      if (songData.file[sizeKey] && midurlinfo[i]?.vkey) {
        const purl = midurlinfo[i].purl
        if (purl) {
          return sip[0] + purl
        }
      }
    }

    throw new ActionFailure(404, '上游未返回可用的音频地址（可能版权受限）')
  },

  async resolveCoverUrl(track: ProviderTrack): Promise<string> {
    return `https://y.gtimg.cn/music/photo_new/T002R300x300M000${track.picId}.jpg?max_age=2592000`
  },

  async getLyric(track: ProviderTrack): Promise<string | null> {
    const res = await fetch(
      `https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?songmid=${track.lyricId}&g_tk=5381`,
      {
        method: 'GET',
        headers: TENCENT_HEADERS,
        signal: AbortSignal.timeout(30000),
      },
    )

    if (!res.ok) {
      throw new Error(`Tencent lyric API returned ${res.status} ${res.statusText}`)
    }

    const text = await res.text()

    // Strip MusicJsonCallback(...) wrapper
    const jsonStr = text.startsWith('MusicJsonCallback(') ? text.slice(18, -1) : text

    let data: Record<string, unknown>
    try {
      data = JSON.parse(jsonStr) as Record<string, unknown>
    } catch {
      log.warn('Failed to parse Tencent lyric response', { sourceId: track.sourceId })
      return null
    }

    const lyricBase64 = data.lyric as string | undefined
    if (!lyricBase64) {
      return null
    }

    const decoded = Buffer.from(lyricBase64, 'base64').toString('utf8')
    const lyricText = decodeHtmlEntities(decoded).trim()
    return lyricText === '' ? null : lyricText
  },
}
