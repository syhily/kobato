import { webmentionLinkHeader } from '@kobato/server/http/webmention-link-header'
import { Hono } from 'hono'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { buildWebmentionLinkHeader, createWebmentionLinkMiddleware } from '@/lib/http/webmention-link'

// The frontend's webmention `Link` header builder vs core's. Core owns
// the receive endpoint and its discovery header
// (`webmentionLinkHeader`); the frontend must emit the SAME header for
// the SAME bundle (the pages are served by the frontend now). This test
// pins the two builders together over a matrix of bundle shapes — a
// drift in either direction fails here.

const BASE_BUNDLE = {
  siteIdentity: { website: 'https://blog.example.com' },
  webmentions: { webmention: { receiveEnabled: true } },
} as const

const BUNDLE_SAMPLES = [
  { name: 'receive on + website set', bundle: BASE_BUNDLE },
  { name: 'receive off', bundle: { ...BASE_BUNDLE, webmentions: { webmention: { receiveEnabled: false } } } },
  { name: 'receive unset (defaults on)', bundle: { siteIdentity: { website: 'https://blog.example.com' } } },
  { name: 'no website', bundle: { webmentions: { webmention: { receiveEnabled: true } } } },
  { name: 'empty website', bundle: { ...BASE_BUNDLE, siteIdentity: { website: '' } } },
  { name: 'invalid website URL', bundle: { ...BASE_BUNDLE, siteIdentity: { website: 'not a url' } } },
  { name: 'null bundle', bundle: null },
] as const

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('buildWebmentionLinkHeader ↔ core webmentionLinkHeader parity', () => {
  for (const sample of BUNDLE_SAMPLES) {
    it(`matches core for "${sample.name}"`, () => {
      expect(buildWebmentionLinkHeader(sample.bundle as never)).toBe(webmentionLinkHeader(sample.bundle as never))
    })
  }

  it('emits the core URL shape when enabled', () => {
    expect(buildWebmentionLinkHeader(BASE_BUNDLE as never)).toBe(
      '<https://blog.example.com/webmention>; rel="webmention"',
    )
  })
})

describe('createWebmentionLinkMiddleware', () => {
  function makeApp() {
    const app = new Hono()
    app.use(createWebmentionLinkMiddleware('http://core:4321'))
    return app
  }

  it('appends the Link header to HTML responses while the receive switch is on', async () => {
    const app = makeApp()
    app.get('/', (c) => c.html('<html><body>hi</body></html>'))
    // Lazy layout-bundle fetch: the first HTML response triggers one
    // core round-trip, then the 60 s TTL cache serves the rest. The wire
    // shape is the oRPC RPC envelope `{ json: <data> }` (see
    // `packages/test-utils/tests/_helpers/rpc-call.ts`).
    const upstream = vi.fn(
      async () =>
        new Response(JSON.stringify({ json: { blogSettings: BASE_BUNDLE } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    )
    vi.stubGlobal('fetch', upstream)

    const res1 = await app.request('/')
    const res2 = await app.request('/')

    expect(res1.status).toBe(200)
    expect(res1.headers.get('Link')).toBe('<https://blog.example.com/webmention>; rel="webmention"')
    expect(upstream).toHaveBeenCalledTimes(1)
    expect(upstream).toHaveBeenCalledWith('http://core:4321/rpc/content/layout', {
      headers: { accept: 'application/json' },
    })
    // TTL cache: the second page load did not hit core again.
    expect(res2.headers.get('Link')).toBe('<https://blog.example.com/webmention>; rel="webmention"')
  })

  it('does not append the header when the receive switch is off', async () => {
    const app = makeApp()
    app.get('/', (c) => c.html('<html><body>hi</body></html>'))
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              json: {
                blogSettings: { ...BASE_BUNDLE, webmentions: { webmention: { receiveEnabled: false } } },
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
      ),
    )

    const res = await app.request('/')

    expect(res.headers.get('Link')).toBeNull()
  })

  it('stays silent when core is unreachable (no header, no 500)', async () => {
    const app = makeApp()
    app.get('/', (c) => c.html('<html><body>hi</body></html>'))
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNREFUSED')
      }),
    )

    const res = await app.request('/')

    expect(res.status).toBe(200)
    expect(res.headers.get('Link')).toBeNull()
  })

  it('leaves non-HTML responses untouched', async () => {
    const app = makeApp()
    app.get('/feed', (c) => c.body('<feed/>', 200, { 'Content-Type': 'application/xml' }))
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ json: { blogSettings: BASE_BUNDLE } }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    )

    const res = await app.request('/feed')

    expect(res.status).toBe(200)
    expect(res.headers.get('Link')).toBeNull()
  })
})
