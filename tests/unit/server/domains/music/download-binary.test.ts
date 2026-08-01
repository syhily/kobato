import { describe, expect, it, vi } from 'vitest'

import { downloadBinary } from '@/server/domains/music/services/write/shared'
import { DomainError } from '@/server/infra/http/errors'

// downloadBinary resolves hostnames through safe-fetch's DNS guard —
// pin it to a public address so tests stay hermetic.
vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(async () => [{ address: '93.184.216.34', family: 4 }]),
}))

describe('downloadBinary', () => {
  function stubFetch(responses: Array<{ status?: number; headers?: Headers; body?: Uint8Array<ArrayBuffer> }>) {
    let i = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        const r = responses[i] ?? {}
        i += 1
        // A real Response: safe-fetch reads `.status` for the manual
        // redirect loop and streams `.body` through a size-capped reader.
        return Promise.resolve(
          new Response(r.body ?? new Uint8Array(4), { status: r.status ?? 200, headers: r.headers }),
        )
      }),
    )
  }

  it('rejects file: URL', async () => {
    await expect(downloadBinary('file:///etc/passwd', 1000, 'cover')).rejects.toThrow(DomainError)
    await expect(downloadBinary('file:///etc/passwd', 1000, 'cover')).rejects.toThrow('封面地址协议不被支持')
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    await expect(downloadBinary('file:///etc/passwd', 1000, 'cover')).rejects.toThrow()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('rejects localhost', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    await expect(downloadBinary('http://localhost:8432/x', 1000, 'cover')).rejects.toThrow(DomainError)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('rejects loopback IP', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    await expect(downloadBinary('http://127.0.0.1/x', 1000, 'cover')).rejects.toThrow(DomainError)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('rejects private range 192.168.x.x', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    await expect(downloadBinary('http://192.168.1.1/x', 1000, 'cover')).rejects.toThrow(DomainError)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('rejects private range 10.x.x.x', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    await expect(downloadBinary('http://10.0.0.5/x', 1000, 'cover')).rejects.toThrow(DomainError)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('rejects link-local / metadata endpoint', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    await expect(downloadBinary('http://169.254.169.254/latest/meta-data/', 1000, 'cover')).rejects.toThrow(DomainError)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('rejects malformed URL', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    await expect(downloadBinary('not a url', 1000, 'cover')).rejects.toThrow(DomainError)
    await expect(downloadBinary('not a url', 1000, 'cover')).rejects.toThrow('封面地址无效')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('allows a public https CDN URL', async () => {
    stubFetch([{ body: new Uint8Array(4) }])
    const result = await downloadBinary('https://p3.music.126.net/abc/123.jpg', 1000, 'cover')
    expect(result).toBeInstanceOf(Buffer)
    expect(result.length).toBe(4)
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1)
  })

  it('rejects a redirect to an internal address (SSRF)', async () => {
    stubFetch([{ status: 302, headers: new Headers({ location: 'http://169.254.169.254/' }) }])
    await expect(downloadBinary('https://p3.music.126.net/abc/123.jpg', 1000, 'cover')).rejects.toThrow(DomainError)
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1)
  })
})
