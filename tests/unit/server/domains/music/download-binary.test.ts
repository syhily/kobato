import { describe, expect, it, vi } from 'vitest'

import { downloadBinary } from '@/server/domains/music/services/write/shared'
import { DomainError } from '@/server/infra/http/errors'

describe('downloadBinary', () => {
  function stubFetch(arrayBuffer?: ArrayBuffer) {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          headers: new Headers(),
          arrayBuffer: async () => arrayBuffer ?? new ArrayBuffer(4),
        }),
      ),
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
    await expect(downloadBinary('http://localhost:5432/x', 1000, 'cover')).rejects.toThrow(DomainError)
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
    stubFetch(new ArrayBuffer(4))
    const result = await downloadBinary('https://p3.music.126.net/abc/123.jpg', 1000, 'cover')
    expect(result).toBeInstanceOf(Buffer)
    expect(result.length).toBe(4)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1)
  })
})
