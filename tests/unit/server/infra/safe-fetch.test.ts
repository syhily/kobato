import type { AddressInfo } from 'node:net'
import type { Mock } from 'vitest'

import { lookup } from 'node:dns/promises'
import { createServer } from 'node:http'
import { Agent, fetch as undiciFetch } from 'undici'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createDialLookup, safeFetch } from '@/server/infra/safe-fetch'

// Unit surface for the SSRF invariant (plan 042): allowlist, per-hop
// host revalidation, redirect budget, timeout, size cap.
// `isBlockedFetchHost` stays real — only `fetch` is stubbed; DNS defaults to a public address.

interface DnsAddress {
  address: string
  family: number
}

vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(async (): Promise<DnsAddress[]> => [{ address: '93.184.216.34', family: 4 }]),
}))

// `lookup` is overloaded; the cast re-types it to the `{ all: true }` shape.
const lookupMock = lookup as unknown as Mock<(hostname: string, options?: unknown) => Promise<DnsAddress[]>>

const publicDns = [{ address: '93.184.216.34', family: 4 }]

afterEach(() => {
  vi.unstubAllGlobals()
  lookupMock.mockResolvedValue(publicDns)
})

function mockFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    return handler(url, init)
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

describe('infra/safe-fetch — initial URL guard', () => {
  it('rejects an unparseable URL without fetching', async () => {
    const fn = mockFetch(() => new Response(null, { status: 200 }))
    const result = await safeFetch('not-a-url')
    expect(result).toMatchObject({ ok: false, reason: 'invalid-url', url: 'not-a-url' })
    expect(fn).not.toHaveBeenCalled()
  })

  it('rejects a non-http(s) protocol without fetching', async () => {
    const fn = mockFetch(() => new Response(null, { status: 200 }))
    const result = await safeFetch('ftp://example.com/x')
    expect(result).toMatchObject({ ok: false, reason: 'bad-protocol' })
    // The trusted-origin exemption never bypasses the protocol gate.
    await expect(safeFetch('ftp://example.com/x', { trustedOrigin: 'ftp://example.com' })).resolves.toMatchObject({
      ok: false,
      reason: 'bad-protocol',
    })
    expect(fn).not.toHaveBeenCalled()
  })

  it('rejects a blocked private IP on the first request without fetching', async () => {
    const fn = mockFetch(() => new Response(null, { status: 200 }))
    const result = await safeFetch('http://127.0.0.1/x')
    expect(result).toMatchObject({ ok: false, reason: 'blocked-host' })
    expect(fn).not.toHaveBeenCalled()
  })

  it('rejects a non-standard port without fetching', async () => {
    const fn = mockFetch(() => new Response(null, { status: 200 }))
    await expect(safeFetch('http://example.com:8080/x')).resolves.toMatchObject({ ok: false, reason: 'bad-port' })
    await expect(safeFetch('https://example.com:8443/x')).resolves.toMatchObject({ ok: false, reason: 'bad-port' })
    expect(fn).not.toHaveBeenCalled()
  })

  it('rejects a redirect target on a non-standard port before dialing it', async () => {
    const fn = mockFetch(
      () => new Response(null, { status: 302, headers: { location: 'https://cdn.example.com:9090/internal' } }),
    )
    const result = await safeFetch('https://cdn.example.com/start')
    expect(result).toMatchObject({ ok: false, reason: 'bad-port', url: 'https://cdn.example.com:9090/internal' })
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('allows explicit standard ports and the protocol default', async () => {
    const fn = mockFetch(() => new Response(new Uint8Array([1]), { status: 200 }))
    await expect(safeFetch('http://example.com:80/x')).resolves.toMatchObject({ ok: true })
    await expect(safeFetch('https://example.com:443/x')).resolves.toMatchObject({ ok: true })
    await expect(safeFetch('https://example.com/x')).resolves.toMatchObject({ ok: true })
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('allows a non-standard port only with the explicit opt-in', async () => {
    const fn = mockFetch(() => new Response(new Uint8Array([1]), { status: 200 }))
    await expect(safeFetch('http://v3.example.com:8000/api', { allowNonStandardPort: true })).resolves.toMatchObject({
      ok: true,
    })
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('rejects localhost names and link-local addresses without fetching', async () => {
    const fn = mockFetch(() => new Response(null, { status: 200 }))
    await expect(safeFetch('http://localhost/x')).resolves.toMatchObject({ ok: false, reason: 'blocked-host' })
    await expect(safeFetch('http://169.254.169.254/latest/meta-data')).resolves.toMatchObject({
      ok: false,
      reason: 'blocked-host',
    })
    expect(fn).not.toHaveBeenCalled()
  })

  it('allows a loopback fixed endpoint only through the exact trusted origin', async () => {
    const fn = mockFetch(() => new Response(new Uint8Array([1]), { status: 200 }))
    await expect(
      safeFetch('http://127.0.0.1:5080/healthz', { trustedOrigin: 'http://127.0.0.1:5080' }),
    ).resolves.toMatchObject({ ok: true })
    expect(fn).toHaveBeenCalledTimes(1)

    // A different origin (even the same loopback host on another port) stays blocked.
    await expect(
      safeFetch('http://127.0.0.1:5081/healthz', { trustedOrigin: 'http://127.0.0.1:5080' }),
    ).resolves.toMatchObject({ ok: false, reason: 'bad-port' })
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('still blocks a redirect from a trusted origin to another private origin', async () => {
    const fn = mockFetch(
      () => new Response(null, { status: 302, headers: { location: 'http://127.0.0.1:9000/internal' } }),
    )
    await expect(
      safeFetch('http://127.0.0.1:5080/healthz', { trustedOrigin: 'http://127.0.0.1:5080' }),
    ).resolves.toMatchObject({ ok: false, reason: 'bad-port', url: 'http://127.0.0.1:9000/internal' })
    expect(fn).toHaveBeenCalledTimes(1)
  })
})

describe('infra/safe-fetch — DNS guard', () => {
  it('rejects a public hostname that resolves to a private IP without fetching', async () => {
    lookupMock.mockResolvedValue([{ address: '127.0.0.1', family: 4 }])
    const fn = mockFetch(() => new Response(null, { status: 200 }))
    const result = await safeFetch('https://rebinding.example.com/x')
    expect(result).toMatchObject({ ok: false, reason: 'blocked-host', url: 'https://rebinding.example.com/x' })
    expect(fn).not.toHaveBeenCalled()
  })

  it('lets a trusted fixed endpoint resolve to a private address', async () => {
    lookupMock.mockResolvedValue([{ address: '10.0.0.12', family: 4 }])
    const fn = mockFetch(() => new Response(new Uint8Array([1]), { status: 200 }))
    await expect(
      safeFetch('https://obs.internal.example.com/healthz', {
        trustedOrigin: 'https://obs.internal.example.com',
      }),
    ).resolves.toMatchObject({ ok: true })
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('rejects when ANY resolved address is private', async () => {
    lookupMock.mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
      { address: '169.254.169.254', family: 4 },
    ])
    const fn = mockFetch(() => new Response(null, { status: 200 }))
    const result = await safeFetch('https://mixed.example.com/x')
    expect(result).toMatchObject({ ok: false, reason: 'blocked-host' })
    expect(fn).not.toHaveBeenCalled()
  })

  it('rejects when DNS resolves to an IPv6 ULA address', async () => {
    lookupMock.mockResolvedValue([{ address: 'fd00::1', family: 6 }])
    const fn = mockFetch(() => new Response(null, { status: 200 }))
    const result = await safeFetch('https://v6.example.com/x')
    expect(result).toMatchObject({ ok: false, reason: 'blocked-host' })
    expect(fn).not.toHaveBeenCalled()
  })

  it('skips the DNS lookup for IP literals', async () => {
    lookupMock.mockClear()
    const fn = mockFetch(() => new Response(new Uint8Array([1]), { status: 200 }))
    const result = await safeFetch('https://8.8.8.8/x')
    expect(lookupMock).not.toHaveBeenCalled()
    expect(result.ok).toBe(true)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('fails closed when DNS resolution fails', async () => {
    lookupMock.mockRejectedValue(new Error('ENOTFOUND'))
    const fn = mockFetch(() => new Response(new Uint8Array([1]), { status: 200 }))
    const result = await safeFetch('https://gone.example.com/x')
    expect(result).toMatchObject({ ok: false, reason: 'dns-failure', url: 'https://gone.example.com/x' })
    expect(fn).not.toHaveBeenCalled()
  })

  it('fails closed when DNS resolves to an empty address list', async () => {
    lookupMock.mockResolvedValue([])
    const fn = mockFetch(() => new Response(new Uint8Array([1]), { status: 200 }))
    const result = await safeFetch('https://empty.example.com/x')
    expect(result).toMatchObject({ ok: false, reason: 'dns-failure' })
    expect(fn).not.toHaveBeenCalled()
  })

  it('hands every hop a dial-time validating dispatcher', async () => {
    const fn = mockFetch((url) =>
      url === 'https://cdn.example.com/start'
        ? new Response(null, { status: 302, headers: { location: '/next' } })
        : new Response(new Uint8Array([1]), { status: 200 }),
    )
    await safeFetch('https://cdn.example.com/start')
    expect(fn).toHaveBeenCalledTimes(2)
    for (const [, init] of fn.mock.calls) {
      expect(init).toMatchObject({ dispatcher: expect.objectContaining({ dispatch: expect.any(Function) }) })
    }
  })

  it('re-runs the DNS guard on every redirect hop', async () => {
    const fn = mockFetch(
      () => new Response(null, { status: 302, headers: { location: 'https://internal.example.com/x' } }),
    )
    lookupMock.mockResolvedValueOnce(publicDns).mockResolvedValueOnce([{ address: '192.168.1.1', family: 4 }])
    const result = await safeFetch('https://cdn.example.com/start')
    expect(result).toMatchObject({ ok: false, reason: 'blocked-host', url: 'https://internal.example.com/x' })
    expect(fn).toHaveBeenCalledTimes(1)
  })
})

describe('infra/safe-fetch — dial-time DNS binding', () => {
  it('lets the trusted endpoint hostname dial a private address at connect time', async () => {
    lookupMock.mockResolvedValue([{ address: '10.0.0.12', family: 4 }])
    const callback = vi.fn()
    createDialLookup(new Set(['obs.internal.example.com']))('obs.internal.example.com', { all: true }, callback)
    await vi.waitFor(() => expect(callback).toHaveBeenCalled())
    expect(callback.mock.calls[0]?.[0]).toBeNull()
    expect(callback.mock.calls[0]?.[1]).toEqual([{ address: '10.0.0.12', family: 4 }])
  })

  it('aborts the connection when the dial-time lookup resolves a blocked address', async () => {
    // Real socket, real undici Agent — only `node:dns/promises` is mocked.
    // The validating lookup is exercised directly: safeFetch's own port
    // allowlist would reject the test server's ephemeral port at the
    // pre-check, before any dial could happen.
    let hits = 0
    const server = createServer((_req, res) => {
      hits += 1
      res.writeHead(200)
      res.end('internal')
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const port = (server.address() as AddressInfo).port
    try {
      // DNS answers loopback at connect time — the dial must refuse even
      // though the host:port combination is perfectly reachable.
      lookupMock.mockResolvedValue([{ address: '127.0.0.1', family: 4 }])
      const agent = new Agent({ connect: { lookup: createDialLookup() } })
      let thrown: unknown
      try {
        thrown = await undiciFetch(`http://rebind.example.com:${port}/latest/meta-data`, {
          dispatcher: agent,
        }).catch((error: unknown) => error)
      } finally {
        await agent.destroy().catch(() => undefined)
      }
      // The dial itself must have rejected the blocked address — not a
      // generic "unresolvable host" failure (undici wraps the connect error
      // in a cause chain, so walk it).
      let chain = ''
      for (let cur = thrown; cur instanceof Error; cur = cur.cause) {
        chain += `${cur.message}|`
      }
      expect(chain).toContain('blocked address')
      expect(hits).toBe(0)
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })
})

describe('infra/safe-fetch — redirect loop', () => {
  it('blocks a 302 toward a private IP on the hop', async () => {
    const fn = mockFetch(
      () => new Response(null, { status: 302, headers: { location: 'http://192.168.1.1/internal' } }),
    )
    const result = await safeFetch('https://cdn.example.com/start')
    expect(result).toMatchObject({ ok: false, reason: 'blocked-host', url: 'http://192.168.1.1/internal' })
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('follows a 302 toward a safe host and returns the final body', async () => {
    const body = new Uint8Array([5, 6, 7])
    const fn = mockFetch((url) => {
      if (url === 'https://cdn.example.com/start') {
        return new Response(null, { status: 302, headers: { location: '/final' } })
      }
      return new Response(body, { status: 200 })
    })
    const result = await safeFetch('https://cdn.example.com/start')
    expect(fn).toHaveBeenCalledTimes(2)
    expect(fn).toHaveBeenLastCalledWith('https://cdn.example.com/final', expect.anything())
    if (!result.ok) {
      throw new Error(`expected success, got ${result.reason}`)
    }
    expect(result.url).toBe('https://cdn.example.com/final')
    expect(new Uint8Array(result.body)).toEqual(body)
  })

  it('fails with too-many-redirects when the budget is exhausted', async () => {
    const fn = mockFetch((url) => new Response(null, { status: 302, headers: { location: `${url}?hop` } }))
    const result = await safeFetch('https://cdn.example.com/a', { maxRedirects: 2 })
    expect(result).toMatchObject({ ok: false, reason: 'too-many-redirects' })
    // budget 2 → the third 3xx response trips the cap
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('rejects the first 3xx outright when maxRedirects is 0', async () => {
    const fn = mockFetch(
      () => new Response(null, { status: 302, headers: { location: 'https://cdn.example.com/next' } }),
    )
    const result = await safeFetch('https://cdn.example.com/a', { maxRedirects: 0 })
    expect(result).toMatchObject({ ok: false, reason: 'too-many-redirects' })
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('fails a 3xx without a Location header', async () => {
    mockFetch(() => new Response(null, { status: 302 }))
    const result = await safeFetch('https://cdn.example.com/a')
    expect(result).toMatchObject({ ok: false, reason: 'missing-redirect-location' })
  })

  it('honors the per-hop veto hook before fetching the hop', async () => {
    const fn = mockFetch((url) => {
      if (url === 'https://cdn.example.com/start') {
        return new Response(null, { status: 302, headers: { location: 'https://cdn.example.com/sentinel' } })
      }
      return new Response(new Uint8Array([1]), { status: 200 })
    })
    const result = await safeFetch('https://cdn.example.com/start', {
      shouldFollowRedirect: (nextUrl) => nextUrl.toString() !== 'https://cdn.example.com/sentinel',
    })
    expect(result).toMatchObject({ ok: false, reason: 'redirect-vetoed', url: 'https://cdn.example.com/sentinel' })
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('strips credential headers when a redirect crosses origins', async () => {
    const fn = mockFetch((url) => {
      if (url === 'https://cdn.example.com/start') {
        return new Response(null, { status: 302, headers: { location: 'https://other.example.com/final' } })
      }
      return new Response(new Uint8Array([1]), { status: 200 })
    })
    const result = await safeFetch('https://cdn.example.com/start', {
      headers: {
        Referer: 'https://music.163.com/',
        Authorization: 'Bearer token',
        Cookie: 'sid=1',
        'User-Agent': 'ua',
      },
    })
    expect(result).toMatchObject({ ok: true, url: 'https://other.example.com/final' })
    expect(fn).toHaveBeenLastCalledWith(
      'https://other.example.com/final',
      expect.objectContaining({ headers: { 'User-Agent': 'ua' } }),
    )
  })

  it('keeps credential headers on a same-origin redirect', async () => {
    const fn = mockFetch((url) => {
      if (url === 'https://cdn.example.com/start') {
        return new Response(null, { status: 302, headers: { location: '/final' } })
      }
      return new Response(new Uint8Array([1]), { status: 200 })
    })
    await safeFetch('https://cdn.example.com/start', { headers: { Referer: 'https://music.163.com/' } })
    expect(fn).toHaveBeenLastCalledWith(
      'https://cdn.example.com/final',
      expect.objectContaining({ headers: { Referer: 'https://music.163.com/' } }),
    )
  })
})

describe('infra/safe-fetch — response failures', () => {
  it('maps a non-2xx status to http-error with the status attached', async () => {
    mockFetch(() => new Response('nope', { status: 503 }))
    const result = await safeFetch('https://cdn.example.com/a')
    expect(result).toMatchObject({ ok: false, reason: 'http-error', status: 503 })
  })

  it('maps a fetch rejection to fetch-failed with the error and url attached', async () => {
    const cause = new Error('econnreset')
    mockFetch(() => Promise.reject(cause))
    const result = await safeFetch('https://cdn.example.com/a')
    expect(result).toMatchObject({ ok: false, reason: 'fetch-failed', url: 'https://cdn.example.com/a', error: cause })
  })

  it('maps an AbortSignal timeout to timeout', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(new DOMException('The operation timed out.', 'TimeoutError')),
            )
          }),
      ),
    )
    const result = await safeFetch('https://cdn.example.com/a', { timeoutMs: 5 })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('timeout')
      expect(result.error).toBeInstanceOf(DOMException)
    }
  })
})

describe('infra/safe-fetch — size cap', () => {
  it('rejects early when content-length advertises a size over the cap', async () => {
    mockFetch(() => new Response(new Uint8Array(0), { status: 200, headers: { 'content-length': '11' } }))
    const result = await safeFetch('https://cdn.example.com/a', { maxBytes: 10 })
    expect(result).toMatchObject({ ok: false, reason: 'too-large' })
  })

  it('rejects when the actual body exceeds the cap despite a small content-length', async () => {
    mockFetch(() => new Response(new Uint8Array(11), { status: 200, headers: { 'content-length': '1' } }))
    const result = await safeFetch('https://cdn.example.com/a', { maxBytes: 10 })
    expect(result).toMatchObject({ ok: false, reason: 'too-large' })
  })

  it('ignores a non-numeric content-length and succeeds', async () => {
    mockFetch(
      () => new Response(new Uint8Array([1, 2]), { status: 200, headers: { 'content-length': 'not-a-number' } }),
    )
    const result = await safeFetch('https://cdn.example.com/a', { maxBytes: 10 })
    if (!result.ok) {
      throw new Error(`expected success, got ${result.reason}`)
    }
    expect(result.body.byteLength).toBe(2)
  })

  it('rejects a chunked body with no content-length once the streamed total trips the cap', async () => {
    let cancelled = false
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(6))
        controller.enqueue(new Uint8Array(6))
        // never closed: the guard must stop the read before the stream ends
      },
      cancel() {
        cancelled = true
      },
    })
    mockFetch(() => new Response(body, { status: 200 }))
    const result = await safeFetch('https://cdn.example.com/a', { maxBytes: 10 })
    expect(result).toMatchObject({ ok: false, reason: 'too-large' })
    expect(cancelled).toBe(true)
  })

  it('applies no cap when maxBytes is omitted', async () => {
    mockFetch(() => new Response(new Uint8Array(1024), { status: 200 }))
    const result = await safeFetch('https://cdn.example.com/a')
    if (!result.ok) {
      throw new Error(`expected success, got ${result.reason}`)
    }
    expect(result.body.byteLength).toBe(1024)
  })
})

describe('infra/safe-fetch — stream mode', () => {
  it('returns the live body stream without buffering it', async () => {
    mockFetch(() => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'audio/mpeg' } }))
    const result = await safeFetch('https://cdn.example.com/a', { stream: true })
    if (!result.ok) {
      throw new Error(`expected success, got ${result.reason}`)
    }
    expect(result.url).toBe('https://cdn.example.com/a')
    expect(result.response.headers.get('content-type')).toBe('audio/mpeg')
    expect(new Uint8Array(await result.response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))
  })

  it('errors the stream once the cap trips instead of truncating silently', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(6))
        controller.enqueue(new Uint8Array(6))
        controller.close()
      },
    })
    mockFetch(() => new Response(body, { status: 200 }))
    const result = await safeFetch('https://cdn.example.com/a', { stream: true, maxBytes: 10 })
    if (!result.ok) {
      throw new Error(`expected success, got ${result.reason}`)
    }
    await expect(result.response.arrayBuffer()).rejects.toThrow(/exceeded/)
  })

  it('still rejects early when content-length advertises a size over the cap', async () => {
    const fn = mockFetch(() => new Response(new Uint8Array(0), { status: 200, headers: { 'content-length': '11' } }))
    const result = await safeFetch('https://cdn.example.com/a', { stream: true, maxBytes: 10 })
    expect(result).toMatchObject({ ok: false, reason: 'too-large' })
    expect(fn).toHaveBeenCalledTimes(1)
  })
})

describe('infra/safe-fetch — success shape', () => {
  it('returns the response alongside the buffered body', async () => {
    mockFetch(() => new Response(new Uint8Array([9]), { status: 200, headers: { 'x-up': '1' } }))
    const result = await safeFetch('https://cdn.example.com/a')
    if (!result.ok) {
      throw new Error(`expected success, got ${result.reason}`)
    }
    expect(result.url).toBe('https://cdn.example.com/a')
    expect(result.response.status).toBe(200)
    expect(result.response.headers.get('x-up')).toBe('1')
    expect(new Uint8Array(result.body)).toEqual(new Uint8Array([9]))
  })
})

describe('infra/safe-fetch — method and body', () => {
  it('sends a POST with its body and content headers', async () => {
    const fn = mockFetch(() => new Response(new Uint8Array(0), { status: 202 }))
    const result = await safeFetch('https://wm.example.com/endpoint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'source=https%3A%2F%2Fa.dev&target=https%3A%2F%2Fb.dev',
    })
    // A 202 is a success (`response.ok`), the webmention accept semantics.
    expect(result).toMatchObject({ ok: true })
    expect(fn).toHaveBeenCalledWith(
      'https://wm.example.com/endpoint',
      expect.objectContaining({
        method: 'POST',
        body: 'source=https%3A%2F%2Fa.dev&target=https%3A%2F%2Fb.dev',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }),
    )
  })

  it('rewrites a POST to a bodiless GET across a 303, dropping content headers', async () => {
    const fn = mockFetch((url) => {
      if (url === 'https://wm.example.com/endpoint') {
        return new Response(null, { status: 303, headers: { location: 'https://wm.example.com/done' } })
      }
      return new Response(new Uint8Array([1]), { status: 200 })
    })
    const result = await safeFetch('https://wm.example.com/endpoint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'test' },
      body: 'x=1',
    })
    expect(result).toMatchObject({ ok: true, url: 'https://wm.example.com/done' })
    expect(fn).toHaveBeenLastCalledWith(
      'https://wm.example.com/done',
      expect.objectContaining({ method: 'GET', body: undefined, headers: { 'User-Agent': 'test' } }),
    )
  })

  it('rewrites a POST to GET across a 302 as well', async () => {
    const fn = mockFetch((url) => {
      if (url === 'https://wm.example.com/endpoint') {
        return new Response(null, { status: 302, headers: { location: '/done' } })
      }
      return new Response(new Uint8Array([1]), { status: 200 })
    })
    await safeFetch('https://wm.example.com/endpoint', { method: 'POST', body: 'x=1' })
    expect(fn).toHaveBeenLastCalledWith(
      'https://wm.example.com/done',
      expect.objectContaining({ method: 'GET', body: undefined }),
    )
  })

  it('carries method and body forward across a 307', async () => {
    const fn = mockFetch((url) => {
      if (url === 'https://wm.example.com/endpoint') {
        return new Response(null, { status: 307, headers: { location: '/moved' } })
      }
      return new Response(new Uint8Array([1]), { status: 200 })
    })
    await safeFetch('https://wm.example.com/endpoint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'x=1',
    })
    expect(fn).toHaveBeenLastCalledWith(
      'https://wm.example.com/moved',
      expect.objectContaining({
        method: 'POST',
        body: 'x=1',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }),
    )
  })
})
