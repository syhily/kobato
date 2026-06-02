import { createCipheriv, createHash, randomBytes } from 'node:crypto'

/**
 * Lightweight Netease Cloud Music API resolver extracted from
 * `@meting/core@1.6.1`. Replaces the dependency for netease-only usage.
 *
 * Each method returns a JSON string so the existing Zod-validated
 * wrapper in `meting.ts` can parse and validate without changes.
 */

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

/* ------------------------------------------------------------------ */
// Raw netease song shape (before formatting)
export interface NeteaseSong {
  id: number
  name: string
  ar: Array<{ name: string }>
  al: {
    name: string
    pic?: number
    pic_str?: string
  }
}

export function formatSong(data: NeteaseSong): Record<string, unknown> {
  return {
    id: data.id,
    name: data.name,
    artist: data.ar.map((a) => a.name),
    album: data.al.name,
    pic_id: data.al.pic_str || data.al.pic,
    url_id: data.id,
    lyric_id: data.id,
    source: 'netease',
  }
}

/* ------------------------------------------------------------------ */

export class NeteaseResolver {
  private readonly deviceId: string

  constructor() {
    this.deviceId = randomBytes(16).toString('hex').toUpperCase()
  }

  private getHeaders(): Record<string, string> {
    const timestamp = Date.now().toString()
    return {
      Referer: 'music.163.com',
      Cookie: `osver=android; appver=8.7.01; os=android; deviceId=${this.deviceId}; channel=netease; requestId=${timestamp}_${Math.floor(
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

  private async eapi(path: string, payload: Record<string, unknown>): Promise<unknown> {
    const url = `${BASE_URL}${path}`
    const encrypted = eapiEncrypt(url, payload)
    const postUrl = url.replace('/api/', '/eapi/')
    const body = buildBody({ params: encrypted })
    return post(postUrl, body, this.getHeaders())
  }

  async search(keyword: string, options?: { limit?: number }): Promise<string> {
    const res = await this.eapi('/api/cloudsearch/pc', {
      s: keyword,
      type: 1,
      limit: options?.limit ?? 30,
      total: 'true',
      offset: 0,
    })
    const result = (res as Record<string, unknown> | undefined)?.result as Record<string, unknown> | undefined
    const songs = result?.songs as NeteaseSong[] | undefined
    const formatted = (songs ?? []).map(formatSong)
    return JSON.stringify(formatted)
  }

  async song(id: number | string): Promise<string> {
    const res = await this.eapi('/api/v3/song/detail/', {
      c: `[{"id":${id},"v":0}]`,
    })
    const songs = (res as Record<string, unknown>)?.songs as NeteaseSong[] | undefined
    const formatted = (songs ?? []).map(formatSong)
    return JSON.stringify(formatted)
  }

  async url(id: number | string, bitrate = 320): Promise<string> {
    const res = await this.eapi('/api/song/enhance/player/url', {
      ids: [String(id)],
      br: bitrate * 1000,
    })
    const data = (res as Record<string, unknown>)?.data as Array<Record<string, unknown>> | undefined
    const first = data?.[0]
    const payload = {
      url: (first?.url as string | undefined) || (first?.uf as Record<string, string> | undefined)?.url || '',
      size: first?.size as number | undefined,
      br: ((first?.br as number | undefined) ?? 0) / 1000,
    }
    return JSON.stringify(payload)
  }

  async lyric(id: number | string): Promise<string> {
    const res = await this.eapi('/api/song/lyric', {
      id: String(id),
      os: 'linux',
      lv: -1,
      kv: -1,
      tv: -1,
    })
    const typed = res as Record<string, unknown>
    const payload = {
      lyric: (typed?.lrc as Record<string, string> | undefined)?.lyric ?? '',
      tlyric: (typed?.tlyric as Record<string, string> | undefined)?.lyric ?? '',
    }
    return JSON.stringify(payload)
  }

  async pic(id: number | string, size = 300): Promise<string> {
    const url = `https://p3.music.126.net/${encryptId(String(id))}/${id}.jpg?param=${size}y${size}`
    return JSON.stringify({ url })
  }
}
