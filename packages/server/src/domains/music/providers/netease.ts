import type { MusicProvider, ProviderSearchResult, ProviderTrack } from '@kobato/server/domains/music/providers/types'

import { ActionFailure } from '@kobato/server/infra/http/errors'
import { getLogger } from '@kobato/server/infra/logger'
import { createCipheriv, createHash, randomBytes } from 'node:crypto'
import { z } from 'zod'

const log = getLogger('music.netease')

// ── Crypto primitives ──────────────────────────────────────────────────────

const EAPI_KEY = Buffer.from('e82ckenh8dichen8', 'utf8')
const BASE_URL = 'http://music.163.com'

function md5(data: string): string {
  return createHash('md5').update(data).digest('hex')
}

function aes128EcbEncrypt(plaintext: string): string {
  const cipher = createCipheriv('aes-128-ecb', EAPI_KEY, null)
  cipher.setAutoPadding(true)
  return cipher.update(plaintext, 'utf8', 'hex') + cipher.final('hex')
}

function eapiEncrypt(url: string, body: Record<string, unknown>): string {
  const text = JSON.stringify(body)
  const path = url.replace(/^https?:\/\/[^/]+/, '')
  const message = `nobody${path}use${text}md5forencrypt`
  const digest = md5(message)
  const data = `${path}-36cd479b6b5-${text}-36cd479b6b5-${digest}`
  return aes128EcbEncrypt(data).toUpperCase()
}

export function encryptId(id: string): string {
  const magic = Buffer.from('3go8&$8*3*3h0k(2)2')
  const buf = Buffer.from(id)
  for (let i = 0; i < buf.length; i++) {
    buf[i] ^= magic[i % magic.length]
  }
  const hash = createHash('md5').update(buf).digest('base64')
  return hash.replace(/\//g, '_').replace(/\+/g, '-')
}

// ── HTTP helpers ───────────────────────────────────────────────────────────

function buildBody(params: Record<string, unknown>): string {
  return new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString()
}

async function post(url: string, body: string, headers: Record<string, string>): Promise<unknown> {
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body,
    signal: AbortSignal.timeout(30000),
  })
  if (!res.ok) {
    throw new Error(`Netease API returned ${res.status} ${res.statusText}`)
  }
  return res.json()
}

function makeHeaders(): Record<string, string> {
  const deviceId = randomBytes(16).toString('hex').toUpperCase()
  const timestamp = Date.now().toString()
  return {
    Referer: 'music.163.com',
    Cookie: `osver=android; appver=8.7.01; os=android; deviceId=${deviceId}; channel=netease; requestId=${timestamp}_${Math.floor(
      Math.random() * 1000,
    )
      .toString()
      .padStart(4, '0')}; __remember_me=true`,
    'User-Agent':
      'Mozilla/5.0 (Linux; Android 11; M2007J3SC Build/RKQ1.200826.002; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/77.0.3865.120 MQQBrowser/6.2 TBS/045714 Mobile Safari/537.36 NeteaseMusic/8.7.01',
    Accept: '*/*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
    Connection: 'keep-alive',
    'Content-Type': 'application/x-www-form-urlencoded',
  }
}

async function eapi(path: string, payload: Record<string, unknown>): Promise<unknown> {
  const url = `${BASE_URL}${path}`
  const encrypted = eapiEncrypt(url, payload)
  const postUrl = url.replace('/api/', '/eapi/')
  const body = buildBody({ params: encrypted })
  return post(postUrl, body, makeHeaders())
}

// ── Raw song parsing ───────────────────────────────────────────────────────

interface RawNeteaseSong {
  id: number
  name: string
  ar: Array<{ name: string }>
  al: { name: string; pic?: number; pic_str?: string }
}

function toTrack(song: RawNeteaseSong): ProviderTrack {
  return {
    source: 'netease',
    sourceId: String(song.id),
    name: song.name,
    artist: song.ar.map((a) => a.name),
    album: song.al.name,
    picId: String(song.al.pic_str ?? song.al.pic ?? ''),
    urlId: String(song.id),
    lyricId: String(song.id),
  }
}

// ── Zod schemas for raw API responses ──────────────────────────────────────

const rawNeteaseSongSchema = z.object({
  id: z.number(),
  name: z.string(),
  ar: z.array(z.object({ name: z.string() })),
  al: z.object({
    name: z.string(),
    pic: z.number().optional(),
    pic_str: z.string().optional(),
  }),
})

const searchResponseSchema = z
  .object({
    result: z
      .object({
        songs: z.array(rawNeteaseSongSchema).optional(),
        songCount: z.number().optional(),
      })
      .optional(),
  })
  .loose()

const songDetailResponseSchema = z.object({ songs: z.array(rawNeteaseSongSchema).optional() }).loose()

const streamUrlResponseSchema = z
  .object({
    data: z
      .array(
        z
          .object({
            url: z.string().optional().nullable(),
            uf: z.union([z.object({ url: z.string() }), z.null()]).optional(),
          })
          .loose(),
      )
      .optional(),
  })
  .loose()

const lyricResponseSchema = z
  .object({
    lrc: z.object({ lyric: z.string() }).optional(),
  })
  .loose()

// ── Provider implementation ─────────────────────────────────────────────────

export const neteaseProvider: MusicProvider = {
  source: 'netease',

  async search(keyword: string, limit: number, offset?: number): Promise<ProviderSearchResult> {
    const trimmed = keyword.trim()
    if (trimmed === '') {
      return { hits: [], hasMore: false }
    }
    const safeLimit = Math.min(Math.max(1, Math.floor(limit)), 30)
    const safeOffset = offset ?? 0

    const res = await eapi('/api/cloudsearch/pc', {
      s: trimmed,
      type: 1,
      limit: safeLimit,
      total: 'true',
      offset: safeOffset,
    })

    const parsed = searchResponseSchema.safeParse(res)
    if (!parsed.success) {
      log.error('Netease search response failed schema validation', {
        issues: parsed.error.issues,
      })
      throw new ActionFailure(502, '上游音乐服务返回异常，请稍后再试')
    }

    const songs = parsed.data.result?.songs ?? []
    const songCount = parsed.data.result?.songCount ?? 0
    const hits = songs.map(toTrack)
    const hasMore = safeOffset + hits.length < songCount
    return { hits, hasMore }
  },

  async getTrack(sourceId: string): Promise<ProviderTrack | null> {
    const res = await eapi('/api/v3/song/detail/', {
      c: `[{"id":${sourceId},"v":0}]`,
    })

    const parsed = songDetailResponseSchema.safeParse(res)
    if (!parsed.success) {
      log.error('Netease song detail response failed schema validation', {
        issues: parsed.error.issues,
      })
      throw new ActionFailure(502, '上游音乐服务返回异常，请稍后再试')
    }

    const songs = parsed.data.songs ?? []
    const first = songs[0]
    return first ? toTrack(first) : null
  },

  async resolveAudioUrl(track: ProviderTrack): Promise<string> {
    const res = await eapi('/api/song/enhance/player/url', {
      ids: [track.urlId],
      br: 320 * 1000,
    })

    const parsed = streamUrlResponseSchema.safeParse(res)
    if (!parsed.success) {
      log.error('Netease stream URL response failed schema validation', {
        issues: parsed.error.issues,
      })
      throw new ActionFailure(502, '上游音乐服务返回异常，请稍后再试')
    }

    const first = parsed.data.data?.[0]
    const url = first?.url || first?.uf?.url || ''
    if (url.trim() === '') {
      throw new ActionFailure(404, '上游未返回可用的音频地址（可能版权受限）')
    }
    return url
  },

  async resolveCoverUrl(track: ProviderTrack): Promise<string> {
    return `https://p3.music.126.net/${encryptId(track.picId)}/${track.picId}.jpg?param=300y300`
  },

  async getLyric(track: ProviderTrack): Promise<string | null> {
    const res = await eapi('/api/song/lyric', {
      id: track.lyricId,
      os: 'linux',
      lv: -1,
      kv: -1,
      tv: -1,
    })

    const parsed = lyricResponseSchema.safeParse(res)
    if (!parsed.success) {
      log.error('Netease lyric response failed schema validation', {
        issues: parsed.error.issues,
      })
      throw new ActionFailure(502, '上游音乐服务返回异常，请稍后再试')
    }

    const text = (parsed.data.lrc?.lyric ?? '').trim()
    return text === '' ? null : text
  },
}
