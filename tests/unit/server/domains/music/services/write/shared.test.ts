import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Database } from '@/server/infra/db/database'

// music/services/write/shared.ts has a clean pure surface:
//   - generateUniquePlayerId — retry-until-unique loop with collision log.
//   - downloadBinary — URL validation, redirect chasing (manual redirect),
//     max-redirect cap, missing-location error, content-length pre-check,
//     byte-size post-check, and the audio/cover message branching.
// We stub the DB lookup, global fetch, and keep isBlockedFetchHost real.

const findMusicByPlayerIdMock = vi.hoisted(() => vi.fn())

vi.mock('@/server/infra/db/operations/music', () => ({
  findMusicByPlayerId: findMusicByPlayerIdMock,
}))
vi.mock('@/server/infra/logger', () => ({
  getLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}))

const { generateUniquePlayerId, downloadBinary, MAX_AUDIO_BYTES, MAX_COVER_BYTES, PLAYER_ID_RETRY_LIMIT } =
  await import('@/server/domains/music/services/write/shared')

const fakeDb = {} as Database

describe('music/write/shared — generateUniquePlayerId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the first non-colliding candidate', async () => {
    findMusicByPlayerIdMock.mockResolvedValue(null)
    const id = await generateUniquePlayerId(fakeDb)
    expect(id).toMatch(/^[a-z0-9]{16}$/)
    expect(findMusicByPlayerIdMock).toHaveBeenCalledTimes(1)
  })

  it('retries on collision until a free id is found', async () => {
    findMusicByPlayerIdMock
      .mockResolvedValueOnce({ id: 1 }) // collision
      .mockResolvedValueOnce({ id: 2 }) // collision
      .mockResolvedValue(null)
    const id = await generateUniquePlayerId(fakeDb)
    expect(id).toMatch(/^[a-z0-9]{16}$/)
    expect(findMusicByPlayerIdMock).toHaveBeenCalledTimes(3)
  })

  it('throws after PLAYER_ID_RETRY_LIMIT consecutive collisions', async () => {
    findMusicByPlayerIdMock.mockResolvedValue({ id: 1 })
    await expect(generateUniquePlayerId(fakeDb)).rejects.toThrow(/playerId 生成失败/)
    expect(findMusicByPlayerIdMock).toHaveBeenCalledTimes(PLAYER_ID_RETRY_LIMIT)
  })
})

describe('music/write/shared — downloadBinary URL validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects an unparseable audio URL', async () => {
    await expect(downloadBinary('not-a-url', 1000, 'audio')).rejects.toThrow(/音频地址无效/)
  })

  it('rejects an unparseable cover URL with the cover message', async () => {
    await expect(downloadBinary(':::bad', 1000, 'cover')).rejects.toThrow(/封面地址无效/)
  })

  it('rejects a non-http(s) protocol', async () => {
    await expect(downloadBinary('ftp://example.com/x.mp3', 1000, 'audio')).rejects.toThrow(/协议不被支持/)
  })

  it('rejects a javascript: scheme URL', async () => {
    await expect(downloadBinary('javascript:alert(1)', 1000, 'audio')).rejects.toThrow()
  })

  it('rejects a private/loopback host', async () => {
    await expect(downloadBinary('http://127.0.0.1/x.mp3', 1000, 'audio')).rejects.toThrow(/内网或本机/)
  })

  it('rejects a 169.254 link-local host', async () => {
    await expect(downloadBinary('http://169.254.169.254/x', 1000, 'cover')).rejects.toThrow(/内网或本机/)
  })
})

describe('music/write/shared — downloadBinary fetch + redirect branches', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function fakeFetchHandler(handler: (url: string) => Response | Promise<Response>) {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      return handler(url)
    }) as typeof globalThis.fetch
  }

  it('returns the buffer on a 2xx response', async () => {
    const body = new Uint8Array([1, 2, 3, 4])
    fakeFetchHandler(() => new Response(body, { status: 200 }))
    const buf = await downloadBinary('https://cdn.example.com/a.mp3', 1000, 'audio')
    expect(buf).toBeInstanceOf(Buffer)
    expect(buf.length).toBe(4)
  })

  it('throws INTERNAL on a network failure', async () => {
    fakeFetchHandler(() => Promise.reject(new Error('econnreset')))
    await expect(downloadBinary('https://cdn.example.com/a.mp3', 1000, 'audio')).rejects.toThrow(
      /下载音频失败，请稍后再试/,
    )
  })

  it('throws INTERNAL on a non-2xx status', async () => {
    fakeFetchHandler(() => new Response('nope', { status: 503 }))
    await expect(downloadBinary('https://cdn.example.com/a.mp3', 1000, 'audio')).rejects.toThrow(/下载音频失败：503/)
  })

  it('follows a Location redirect to a final 2xx', async () => {
    const body = new Uint8Array([5, 6, 7])
    let call = 0
    fakeFetchHandler((url) => {
      call += 1
      if (call === 1) {
        return new Response(null, { status: 302, headers: { Location: 'https://cdn.example.com/final.mp3' } })
      }
      expect(url).toBe('https://cdn.example.com/final.mp3')
      return new Response(body, { status: 200 })
    })
    const buf = await downloadBinary('https://cdn.example.com/start', 1000, 'cover')
    expect(buf.length).toBe(3)
    expect(call).toBe(2)
  })

  it('throws INTERNAL when a 3xx carries no Location header', async () => {
    fakeFetchHandler(() => new Response(null, { status: 302 })) // no Location
    await expect(downloadBinary('https://cdn.example.com/a.mp3', 1000, 'audio')).rejects.toThrow(
      /下载音频失败，请稍后再试/,
    )
  })

  it('throws BAD_REQUEST when redirects exceed MAX_REDIRECTS', async () => {
    fakeFetchHandler((url) => new Response(null, { status: 302, headers: { Location: `${url}?hop` } }))
    await expect(downloadBinary('https://cdn.example.com/a.mp3', 1000, 'audio')).rejects.toThrow(
      /音频地址重定向次数过多/,
    )
  })

  it('re-validates the redirect target and rejects a redirect to an internal host', async () => {
    fakeFetchHandler(() => new Response(null, { status: 302, headers: { Location: 'http://127.0.0.1/steal' } }))
    await expect(downloadBinary('https://cdn.example.com/a.mp3', 1000, 'audio')).rejects.toThrow(/内网或本机/)
  })
})

describe('music/write/shared — downloadBinary size enforcement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects early when content-length advertises a size over the limit', async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(new Uint8Array(0), {
          status: 200,
          headers: { 'content-length': String(MAX_AUDIO_BYTES + 1) },
        }),
    ) as typeof globalThis.fetch
    await expect(downloadBinary('https://cdn.example.com/a.mp3', MAX_AUDIO_BYTES, 'audio')).rejects.toThrow(
      /音频体积超过上限/,
    )
  })

  it('does not reject on an oversized content-length when it is not a finite number', async () => {
    const body = new Uint8Array([1])
    globalThis.fetch = vi.fn(
      async () =>
        new Response(body, {
          status: 200,
          headers: { 'content-length': 'not-a-number' },
        }),
    ) as typeof globalThis.fetch
    const buf = await downloadBinary('https://cdn.example.com/a.mp3', MAX_AUDIO_BYTES, 'audio')
    expect(buf.length).toBe(1)
  })

  it('rejects when the actual byte length exceeds the limit despite a small content-length', async () => {
    const body = new Uint8Array(MAX_COVER_BYTES + 1)
    globalThis.fetch = vi.fn(
      async () =>
        new Response(body, {
          status: 200,
          headers: { 'content-length': '1' }, // misleading
        }),
    ) as typeof globalThis.fetch
    await expect(downloadBinary('https://cdn.example.com/c.jpg', MAX_COVER_BYTES, 'cover')).rejects.toThrow(
      /封面体积超过上限/,
    )
  })

  it('omits the content-length pre-check when the header is absent', async () => {
    const body = new Uint8Array([9, 9])
    globalThis.fetch = vi.fn(async () => new Response(body, { status: 200 })) as typeof globalThis.fetch
    const buf = await downloadBinary('https://cdn.example.com/a.mp3', 1000, 'audio')
    expect(buf.length).toBe(2)
  })
})
