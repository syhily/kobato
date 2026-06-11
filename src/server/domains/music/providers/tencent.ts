/* oxlint-disable typescript/no-unsafe-type-assertion */
import { z } from 'zod'

import type { MusicProvider, ProviderSearchResult, ProviderTrack } from '@/server/domains/music/providers/types'

import { ActionFailure } from '@/server/infra/http/errors'
import { getLogger } from '@/server/infra/logger'

const log = getLogger('music.tencent')

// ── HTTP helpers ────────────────────────────────────────────────────────────

const TENCENT_HEADERS: Record<string, string> = {
  Referer: 'https://y.qq.com/',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: '*/*',
  'Accept-Language': 'zh-CN,zh;q=0.9',
  Connection: 'keep-alive',
}

async function tencentPost(url: string, body: unknown): Promise<unknown> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      ...TENCENT_HEADERS,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  })
  if (!res.ok) {
    throw new Error(`Tencent API returned ${res.status} ${res.statusText}`)
  }
  return res.json()
}

async function tencentGet(url: string, params: Record<string, string>): Promise<unknown> {
  const qs = new URLSearchParams(params).toString()
  const fullUrl = `${url}?${qs}`
  const res = await fetch(fullUrl, {
    method: 'GET',
    headers: {
      ...TENCENT_HEADERS,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
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
  name?: string
  title?: string
  songname?: string
  singer: RawTencentSinger[]
  album: RawTencentAlbum
  file: RawTencentFile
  type?: number
}

function toTrack(song: RawTencentSong): ProviderTrack {
  return {
    source: 'tencent',
    sourceId: song.mid,
    name: song.title ?? song.name ?? song.songname ?? '',
    artist: song.singer.map((s) => s.name),
    album: (song.album?.title ?? '').trim(),
    picId: song.album?.mid ?? '',
    urlId: song.mid,
    lyricId: song.mid,
  }
}

// ── Zod schemas for musicu.fcg responses ────────────────────────────────────

const musicuSearchResponseSchema = z
  .object({
    req_1: z
      .object({
        data: z
          .object({
            body: z
              .object({
                song: z
                  .object({
                    list: z.array(z.any()),
                  })
                  .optional(),
              })
              .optional(),
          })
          .optional(),
      })
      .optional(),
  })
  .loose()

const musicuSongDetailResponseSchema = z
  .object({
    songinfo: z
      .object({
        data: z
          .object({
            track_info: z.any().optional(),
          })
          .optional(),
      })
      .optional(),
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

  async search(keyword: string, limit: number, offset?: number): Promise<ProviderSearchResult> {
    const trimmed = keyword.trim()
    if (trimmed === '') {
      return { hits: [], hasMore: false }
    }

    const safeLimit = Math.min(Math.max(1, Math.floor(limit)), 30)
    const page = Math.floor((offset ?? 0) / safeLimit) + 1

    const res = await tencentPost('https://u.y.qq.com/cgi-bin/musicu.fcg', {
      req_1: {
        method: 'DoSearchForQQMusicDesktop',
        module: 'music.search.SearchCgiService',
        param: {
          num_per_page: safeLimit,
          page_num: page,
          query: trimmed,
          search_type: 0,
        },
      },
    })

    const parsed = musicuSearchResponseSchema.safeParse(res)
    if (!parsed.success) {
      log.error('Tencent search response failed schema validation', { issues: parsed.error.issues })
      throw new ActionFailure(502, '上游音乐服务返回异常，请稍后再试')
    }

    // Support both req_1 (batch key) and music.search.SearchCgiService (service key) response shapes.
    const typedRes = res as Record<string, unknown>
    const batchData = typedRes.req_1 as Record<string, unknown> | undefined
    const serviceData = typedRes['music.search.SearchCgiService'] as Record<string, unknown> | undefined
    const dataBlock = (batchData ?? serviceData) as Record<string, unknown> | undefined
    const innerData = dataBlock?.data as Record<string, unknown> | undefined
    const body = innerData?.body as Record<string, unknown> | undefined
    const song = body?.song as Record<string, unknown> | undefined
    const songs = (song?.list as RawTencentSong[] | undefined) ?? []
    const tracks = songs.map(toTrack)

    // Eagerly resolve audio URLs and filter out tracks that fail resolution.
    const audioResults = await Promise.all(
      tracks.map(async (track) => {
        try {
          const previewUrl = await tencentProvider.resolveAudioUrl(track)
          if (!previewUrl) {
            log.warn('Audio URL resolved to empty, filtering out song', { sourceId: track.sourceId })
            return null
          }
          return { track, previewUrl }
        } catch (error: unknown) {
          log.warn('Audio URL resolution failed, filtering out song', { sourceId: track.sourceId, error })
          return null
        }
      }),
    )

    const validHits = audioResults.filter((r): r is NonNullable<typeof r> => r !== null)

    // Resolve cover URLs and filter out tracks with unreachable covers.
    const hitChecks = await Promise.all(
      validHits.map(async ({ track, previewUrl }) => {
        const coverUrl = await tencentProvider.resolveCoverUrl(track).catch((error: unknown) => {
          log.warn('Cover URL resolution failed', { sourceId: track.sourceId, error })
          return ''
        })
        if (!coverUrl) {
          log.warn('Cover URL empty, filtering out song', { sourceId: track.sourceId })
          return null
        }
        try {
          const headRes = await fetch(coverUrl, {
            method: 'HEAD',
            headers: TENCENT_HEADERS,
            signal: AbortSignal.timeout(5000),
          })
          if (!headRes.ok) {
            log.warn('Cover URL returned non-2xx, filtering out song', {
              sourceId: track.sourceId,
              status: headRes.status,
            })
            return null
          }
        } catch (error: unknown) {
          log.warn('Cover URL check failed, filtering out song', { sourceId: track.sourceId, error })
          return null
        }
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
    const hits = hitChecks.filter((r): r is NonNullable<typeof r> => r !== null)

    const hasMore = songs.length > 0
    return { hits, hasMore }
  },

  async getTrack(sourceId: string): Promise<ProviderTrack | null> {
    const res = await tencentPost('https://u.y.qq.com/cgi-bin/musicu.fcg', {
      comm: { ct: 24, cv: 0 },
      songinfo: {
        method: 'get_song_detail_yqq',
        module: 'music.pf_song_detail_svr',
        param: {
          song_mid: sourceId,
        },
      },
    })

    const parsed = musicuSongDetailResponseSchema.safeParse(res)
    if (!parsed.success) {
      log.error('Tencent song detail response failed schema validation', { issues: parsed.error.issues })
      throw new ActionFailure(502, '上游音乐服务返回异常，请稍后再试')
    }

    const trackInfo = parsed.data.songinfo?.data?.track_info as RawTencentSong | undefined
    return trackInfo ? toTrack(trackInfo) : null
  },

  async resolveAudioUrl(track: ProviderTrack): Promise<string> {
    // Step 1: Get song detail to obtain file info
    const detailRes = await tencentPost('https://u.y.qq.com/cgi-bin/musicu.fcg', {
      comm: { ct: 24, cv: 0 },
      songinfo: {
        method: 'get_song_detail_yqq',
        module: 'music.pf_song_detail_svr',
        param: {
          song_mid: track.urlId,
        },
      },
    })

    const typedDetail = detailRes as Record<string, unknown>
    const songinfo = typedDetail.songinfo as Record<string, unknown> | undefined
    const data = songinfo?.data as Record<string, unknown> | undefined
    const songData = data?.track_info as RawTencentSong | undefined

    if (!songData?.file?.media_mid) {
      throw new ActionFailure(404, '上游未返回完整的歌曲文件信息')
    }

    const guid = Math.floor(Math.random() * 1_000_000_000)
    const uin = '0'

    // Step 2: Request vkey from the vkey server
    const payload = {
      req_0: {
        module: 'vkey.GetVkeyServer',
        method: 'CgiGetVkey',
        param: {
          guid: String(guid),
          songmid: QUALITY_MAP.map(() => songData.mid),
          filename: QUALITY_MAP.map(([, , prefix, ext]) => `${prefix}${songData.file.media_mid}.${ext}`),
          songtype: QUALITY_MAP.map(() => songData.type ?? 0),
          uin,
          loginflag: 1,
          platform: '20',
        },
      },
      comm: {
        uin,
        format: 'json',
        ct: 19,
        cv: 0,
        authst: '',
      },
    }

    const vkeyRes = await tencentGet('https://u.y.qq.com/cgi-bin/musicu.fcg', {
      '-': 'getplaysongvkey',
      g_tk: '5381',
      loginUin: uin,
      hostUin: '0',
      format: 'json',
      inCharset: 'utf8',
      outCharset: 'utf-8',
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
      `https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?songmid=${track.lyricId}&g_tk=5381&loginUin=0&hostUin=0&inCharset=utf8&outCharset=utf-8&notice=0&platform=yqq&needNewCode=0`,
      {
        method: 'GET',
        headers: {
          ...TENCENT_HEADERS,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        signal: AbortSignal.timeout(30000),
      },
    )

    if (!res.ok) {
      throw new Error(`Tencent lyric API returned ${res.status} ${res.statusText}`)
    }

    const text = await res.text()

    // Strip JSONP wrapper (various callback names)
    const jsonpMatch = text.match(/^(?:callback|MusicJsonCallback|jsonCallback)\(([\s\S]*)\)$/)
    const jsonStr = jsonpMatch?.[1] ?? text

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
