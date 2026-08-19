import { z } from 'zod'

import type { MusicProvider, ProviderSearchResult, ProviderTrack } from '@/server/domains/music/providers/types'

import { ActionFailure } from '@/server/infra/http/errors'
import { getLogger } from '@/server/infra/logger'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

const log = getLogger('music.tencent')

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
  // Out-of-range codepoints (> U+10FFFF) are left as the original text.
  decoded = decoded.replace(/&#(\d+);/g, (match, dec: string) => {
    const cp = Number.parseInt(dec, 10)
    return cp <= 0x10ffff ? String.fromCodePoint(cp) : match
  })
  decoded = decoded.replace(/&#x([0-9a-fA-F]+);/g, (match, hex: string) => {
    const cp = Number.parseInt(hex, 16)
    return cp <= 0x10ffff ? String.fromCodePoint(cp) : match
  })
  return decoded
}

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

const QUALITY_MAP: Array<[keyof RawTencentFile, number, string, string]> = [
  ['size_flac', 999, 'F000', 'flac'],
  ['size_320mp3', 320, 'M800', 'mp3'],
  ['size_192aac', 192, 'C600', 'm4a'],
  ['size_128mp3', 128, 'M500', 'mp3'],
  ['size_96aac', 96, 'C400', 'm4a'],
  ['size_48aac', 48, 'C200', 'm4a'],
  ['size_24aac', 24, 'C100', 'm4a'],
]

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
    const typedRes = unsafeCast<Record<string, unknown>>(res)
    const batchData = unsafeCast<Record<string, unknown> | undefined>(typedRes.req_1)
    const serviceData = unsafeCast<Record<string, unknown> | undefined>(typedRes['music.search.SearchCgiService'])
    const dataBlock = unsafeCast<Record<string, unknown> | undefined>(batchData ?? serviceData)
    const innerData = unsafeCast<Record<string, unknown> | undefined>(dataBlock?.data)
    const body = unsafeCast<Record<string, unknown> | undefined>(innerData?.body)
    const song = unsafeCast<Record<string, unknown> | undefined>(body?.song)
    const songs = unsafeCast<RawTencentSong[] | undefined>(song?.list) ?? []
    const tracks = songs.map(toTrack)

    const hasMore = songs.length > 0
    return { hits: tracks, hasMore }
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

    const trackInfo = unsafeCast<RawTencentSong | undefined>(parsed.data.songinfo?.data?.track_info)
    return trackInfo ? toTrack(trackInfo) : null
  },

  async resolveAudioUrl(track: ProviderTrack): Promise<string> {
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

    const typedDetail = unsafeCast<Record<string, unknown>>(detailRes)
    const songinfo = unsafeCast<Record<string, unknown> | undefined>(typedDetail.songinfo)
    const data = unsafeCast<Record<string, unknown> | undefined>(songinfo?.data)
    const songData = unsafeCast<RawTencentSong | undefined>(data?.track_info)

    if (!songData?.file?.media_mid) {
      throw new ActionFailure(404, '上游未返回完整的歌曲文件信息')
    }

    const guid = Math.floor(Math.random() * 1_000_000_000)
    const uin = '0'

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

    const typed = unsafeCast<Record<string, unknown>>(vkeyRes)
    const req0 = unsafeCast<Record<string, unknown> | undefined>(typed.req_0)
    const req0Data = unsafeCast<Record<string, unknown> | undefined>(req0?.data)
    const midurlinfo = unsafeCast<Array<Record<string, string>> | undefined>(req0Data?.midurlinfo)
    const sip = unsafeCast<string[] | undefined>(req0Data?.sip)

    if (!midurlinfo || !sip) {
      throw new ActionFailure(404, '上游未返回音频地址（vkey 解析失败）')
    }

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

    const jsonpMatch = /^(?:callback|MusicJsonCallback|jsonCallback)\(([\s\S]*)\)$/.exec(text)
    const jsonStr = jsonpMatch?.[1] ?? text

    let data: Record<string, unknown>
    try {
      data = unsafeCast<Record<string, unknown>>(JSON.parse(jsonStr))
    } catch {
      log.warn('Failed to parse Tencent lyric response', { sourceId: track.sourceId })
      return null
    }

    const lyricBase64 = unsafeCast<string | undefined>(data.lyric)
    if (!lyricBase64) {
      return null
    }

    const decoded = Buffer.from(lyricBase64, 'base64').toString('utf8')
    const lyricText = decodeHtmlEntities(decoded).trim()
    return lyricText === '' ? null : lyricText
  },
}
