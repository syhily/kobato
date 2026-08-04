import { afterEach, describe, expect, it, vi } from 'vitest'

import { createCoreHttpTransport } from '@/routes/public/client'

// The SSR transport's wire contract (phase 0.6): the SDK's flat
// `ContentPublicRouter` paths are rewritten onto core's `content` key,
// the `comments` prefix passes through, and the frontend's own request
// headers are filtered before forwarding. This file pins the exact
// fetch() call the transport makes — the read-side counterpart of the
// write-proxy contract in `tests/unit/lib/http/rpc-proxy.test.ts`.

function stubFetch() {
  const calls: Array<{ url: string; init: RequestInit }> = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init: init ?? {} })
      return new Response('{}', { status: 200 })
    }),
  )
  return calls
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('createCoreHttpTransport', () => {
  it('rewrites content procedures onto the core `content` router key', async () => {
    const calls = stubFetch()
    const transport = createCoreHttpTransport('http://core:4321/')
    await transport(new Request('http://frontend/rpc/home'))

    expect(calls).toHaveLength(1)
    expect(calls[0]!.url).toBe('http://core:4321/rpc/content/home')
  })

  it('leaves the comments prefix untouched', async () => {
    const calls = stubFetch()
    const transport = createCoreHttpTransport('http://core:4321')
    await transport(new Request('http://frontend/rpc/comments/loadComments?json=%7B%7D'))

    expect(calls[0]!.url).toBe('http://core:4321/rpc/comments/loadComments?json=%7B%7D')
  })

  it('strips frontend-domain cookies and the 304/transport headers', async () => {
    const calls = stubFetch()
    const transport = createCoreHttpTransport('http://core:4321')
    await transport(
      new Request('http://frontend/rpc/home', {
        headers: {
          host: 'frontend',
          connection: 'keep-alive',
          'content-length': '0',
          cookie: 'session=secret',
          'if-none-match': '"etag"',
          'user-agent': 'test-ua',
          'accept-language': 'zh-CN',
          accept: 'application/json',
        },
      }),
    )

    const forwarded = new Headers(calls[0]!.init.headers)
    expect(forwarded.get('host')).toBeNull()
    expect(forwarded.get('connection')).toBeNull()
    expect(forwarded.get('content-length')).toBeNull()
    expect(forwarded.get('cookie')).toBeNull()
    expect(forwarded.get('if-none-match')).toBeNull()
    // UA / accept / accept-language ride along for core's request facts.
    expect(forwarded.get('user-agent')).toBe('test-ua')
    expect(forwarded.get('accept-language')).toBe('zh-CN')
    expect(forwarded.get('accept')).toBe('application/json')
  })

  it('buffers the RPC envelope as a string body', async () => {
    const calls = stubFetch()
    const transport = createCoreHttpTransport('http://core:4321')
    await transport(
      new Request('http://frontend/rpc/content/home', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ json: { page_key: 'pk-1' } }),
      }),
    )

    expect(calls[0]!.init.method).toBe('POST')
    // The stream body is buffered to a string — undici then derives a
    // concrete content-length at send time (the dynamic-body-limit path
    // in core stays on its cheap content-length branch).
    expect(calls[0]!.init.body).toBe(JSON.stringify({ json: { page_key: 'pk-1' } }))
  })

  it('throws when CORE_API_URL is not configured', async () => {
    const transport = createCoreHttpTransport(null)
    await expect(transport(new Request('http://frontend/rpc/home'))).rejects.toThrow(/CORE_API_URL/)
  })
})
