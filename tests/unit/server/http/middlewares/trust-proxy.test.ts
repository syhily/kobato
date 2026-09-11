import { Hono } from 'hono'
import { beforeEach, describe, expect, it } from 'vitest'

import type { Env } from '@/server/http/context'

import {
  TEST_BLOG_SETTINGS_BUNDLE,
  resetBlogSettingsForTests,
  setBlogSettingsBundleForTests,
} from '#/_helpers/blog-settings'
import { trustProxy } from '@/server/http/middlewares/trust-proxy'

function buildApp() {
  const app = new Hono<Env>()
  app.use(trustProxy)
  app.all('/echo', (c) => c.text(new URL(c.req.raw.url).origin))
  return app
}

function httpSiteBundle() {
  const bundle = structuredClone(TEST_BLOG_SETTINGS_BUNDLE)
  bundle.siteIdentity!.website = 'http://example.com'
  return bundle
}

// Gate ON: the fixture bundle declares website 'https://example.com'.
describe('trustProxy / trusted (https site URL)', () => {
  beforeEach(() => {
    setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
  })

  it('rewrites the request URL scheme from X-Forwarded-Proto', async () => {
    const res = await buildApp().request('http://localhost:4321/echo', {
      headers: { 'x-forwarded-proto': 'https' },
    })
    expect(await res.text()).toBe('https://localhost:4321')
  })

  it('keeps the scheme when it already matches', async () => {
    const res = await buildApp().request('https://localhost:4321/echo', {
      headers: { 'x-forwarded-proto': 'https' },
    })
    expect(await res.text()).toBe('https://localhost:4321')
  })

  it('honors a proxy reporting plain http', async () => {
    const res = await buildApp().request('https://localhost:4321/echo', {
      headers: { 'x-forwarded-proto': 'http' },
    })
    expect(await res.text()).toBe('http://localhost:4321')
  })

  it('takes the first hop of a multi-value header', async () => {
    const res = await buildApp().request('http://localhost:4321/echo', {
      headers: { 'x-forwarded-proto': 'https, http' },
    })
    expect(await res.text()).toBe('https://localhost:4321')
  })

  it('falls back to the RFC 7239 Forwarded header', async () => {
    const res = await buildApp().request('http://localhost:4321/echo', {
      headers: { forwarded: 'for=192.0.2.60;proto=https;host=example.com' },
    })
    expect(await res.text()).toBe('https://localhost:4321')
  })

  it('ignores invalid header values on non-canonical hosts', async () => {
    const res = await buildApp().request('http://localhost:4321/echo', {
      headers: { 'x-forwarded-proto': 'gopher' },
    })
    expect(await res.text()).toBe('http://localhost:4321')
  })

  it('assumes https for the canonical host when no proxy header exists', async () => {
    const res = await buildApp().request('http://example.com/echo')
    expect(await res.text()).toBe('https://example.com')
  })

  it('leaves headerless requests to other hosts untouched', async () => {
    const res = await buildApp().request('http://localhost:4321/echo')
    expect(await res.text()).toBe('http://localhost:4321')
  })

  it('preserves method, headers and body across the rebuild', async () => {
    const app = new Hono<Env>()
    app.use(trustProxy)
    app.post('/echo', async (c) => {
      const body = await c.req.raw.text()
      return c.text(`${c.req.raw.method}|${c.req.header('x-custom')}|${new URL(c.req.raw.url).origin}|${body}`)
    })
    const res = await app.request('http://localhost:4321/echo', {
      method: 'POST',
      headers: { 'x-forwarded-proto': 'https', 'x-custom': 'yes' },
      body: 'payload',
    })
    expect(await res.text()).toBe('POST|yes|https://localhost:4321|payload')
  })
})

describe('trustProxy / untrusted (no https site URL)', () => {
  beforeEach(() => {
    resetBlogSettingsForTests()
  })

  it('ignores proxy headers without a configured site URL', async () => {
    const res = await buildApp().request('http://example.com/echo', {
      headers: { 'x-forwarded-proto': 'https' },
    })
    expect(await res.text()).toBe('http://example.com')
  })

  it('ignores proxy headers when the site URL is plain http', async () => {
    setBlogSettingsBundleForTests(httpSiteBundle())
    const res = await buildApp().request('http://example.com/echo', {
      headers: { 'x-forwarded-proto': 'https' },
    })
    expect(await res.text()).toBe('http://example.com')
  })
})
