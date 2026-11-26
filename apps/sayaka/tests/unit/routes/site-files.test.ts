import type { BlogSettingsBundle } from '@kobato/settings/types'

import { unsafeCast } from '@kobato/utils/unsafe-cast'
import { loader as manifestLoader } from '@sayaka/routes/manifest-webmanifest'
import { loader as robotsLoader } from '@sayaka/routes/robots-txt'
import { loader as searchLoader } from '@sayaka/routes/search'
import { loader as tagsLoader } from '@sayaka/routes/tags'
import { createStubKobato, makeSayakaLoaderArgs, STUB_BOOTSTRAP, stubCallsFor } from '@sayaka/tests/utils/stub-kobato'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'

type AnySiteLoader = (args: never) => Promise<Response>

function bootstrapWith(bundle: Record<string, unknown>) {
  return createStubKobato({
    'public.content.bootstrap': () => ({ ...STUB_BOOTSTRAP, blogSettings: unsafeCast<BlogSettingsBundle>(bundle) }),
  })
}

async function invokeSiteFile(
  loader: AnySiteLoader,
  path: string,
  bundle: Record<string, unknown>,
  init?: RequestInit,
): Promise<Response> {
  const stub = bootstrapWith(bundle)
  const { args } = makeSayakaLoaderArgs({ stub, request: new Request(`http://localhost${path}`, init), params: {} })
  return loader(unsafeCast<never>(args))
}

describe('tags and search redirect routes — no backend call', () => {
  it("/tags answers today's 301 to / with the immutable cache header", async () => {
    const response = await tagsLoader()
    expect(response.status).toBe(301)
    expect(response.headers.get('Location')).toBe('/')
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=86400, s-maxage=604800, immutable')
    expect(response.headers.get('Content-Type')).toBe('text/plain; charset=UTF-8')
    await expect(response.text()).resolves.toBe('')
  })

  it('/search without a query answers 301 to /', async () => {
    const stub = createStubKobato({})
    const { args } = makeSayakaLoaderArgs({ stub, request: new Request('http://localhost/search'), params: {} })
    const response = await searchLoader(unsafeCast<never>(args))
    expect(response.status).toBe(301)
    expect(response.headers.get('Location')).toBe('/')
    expect(stub.calls).toEqual([])
  })

  it('/search?q=hello world answers 301 to the path-style search URL', async () => {
    const stub = createStubKobato({})
    const { args } = makeSayakaLoaderArgs({
      stub,
      request: new Request('http://localhost/search?q=hello%20world'),
      params: {},
    })
    const response = await searchLoader(unsafeCast<never>(args))
    expect(response.status).toBe(301)
    expect(response.headers.get('Location')).toBe('/search/hello%20world')
    expect(stub.calls).toEqual([])
  })

  it('/search with a blank query trims to the home redirect', async () => {
    const stub = createStubKobato({})
    const { args } = makeSayakaLoaderArgs({
      stub,
      request: new Request('http://localhost/search?q=%20%20'),
      params: {},
    })
    const response = await searchLoader(unsafeCast<never>(args))
    expect(response.headers.get('Location')).toBe('/')
  })
})

describe('robots.txt route — the settings bundle is the only input', () => {
  it('serves the default robots body with the sitemap link for a configured website', async () => {
    const response = await invokeSiteFile(robotsLoader, '/robots.txt', {
      siteIdentity: { website: 'http://127.0.0.1' },
      assets: { branding: {} },
    })
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('User-agent: *\nAllow: /\nSitemap: http://127.0.0.1/sitemap.xml')
    expect(response.headers.get('Content-Type')).toBe('text/plain; charset=utf-8')
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=3600, must-revalidate')
    expect(response.headers.get('ETag')).toBeNull()
    expect(response.headers.get('Set-Cookie')).toBeNull()
  })

  it('serves the bare allow-all body when no website is configured', async () => {
    const response = await invokeSiteFile(robotsLoader, '/robots.txt', {})
    expect(await response.text()).toBe('User-agent: *\nAllow: /\n')
  })

  it('serves the custom robots.txt verbatim when branding overrides it', async () => {
    const response = await invokeSiteFile(robotsLoader, '/robots.txt', {
      assets: { branding: { robotsTxt: 'User-agent: GPTBot\nDisallow: /' } },
    })
    expect(await response.text()).toBe('User-agent: GPTBot\nDisallow: /')
  })

  it('waits for the shared bootstrap (one procedure call per document request)', async () => {
    const stub = bootstrapWith({})
    const { args } = makeSayakaLoaderArgs({ stub, request: new Request('http://localhost/robots.txt'), params: {} })
    await robotsLoader(unsafeCast<never>(args))
    expect(stubCallsFor(stub, 'public.content.bootstrap')).toHaveLength(1)
  })
})

describe('manifest.webmanifest route — the settings bundle is the only input', () => {
  const BUNDLE = {
    siteIdentity: { title: 'Kobato Smoke' },
    assets: { branding: {} },
  }

  it("serves today's manifest body with the captured headers", async () => {
    const response = await invokeSiteFile(manifestLoader, '/manifest.webmanifest', BUNDLE)
    expect(response.status).toBe(200)
    await expect(response.text()).resolves.toBe(
      '{"name":"Kobato Smoke","short_name":"Kobato Smoke","lang":"zh-CN","icons":[{"src":"/images/icon-192.png","type":"image/png","sizes":"192x192"},{"src":"/images/icon-512.png","type":"image/png","sizes":"512x512"}],"display":"standalone","theme_color":"#ffffff","background_color":"#ffffff"}',
    )
    expect(response.headers.get('Content-Type')).toBe('application/json; charset=utf-8')
    expect(response.headers.get('Cache-Control')).toBe('public, no-cache')
    expect(response.headers.get('Content-Language')).toBe('zh-CN')
    expect(response.headers.get('ETag')).toMatch(/^"[0-9a-f]{32}"$/)
    expect(response.headers.get('Set-Cookie')).toBeNull()
  })

  it('names the fallback site title when none is configured', async () => {
    const response = await invokeSiteFile(manifestLoader, '/manifest.webmanifest', {})
    const body = (await response.text()) as string
    expect(body).toContain('"name":"Site"')
  })

  it('answers a 304 on a matching if-none-match with the full representation header set', async () => {
    const first = await invokeSiteFile(manifestLoader, '/manifest.webmanifest', BUNDLE)
    const etag = first.headers.get('ETag')!
    const conditional = await invokeSiteFile(manifestLoader, '/manifest.webmanifest', BUNDLE, {
      headers: { 'If-None-Match': etag },
    })
    expect(conditional.status).toBe(304)
    expect(conditional.headers.get('ETag')).toBe(etag)
    expect(conditional.headers.get('Content-Type')).toBe('application/json; charset=utf-8')
    expect(conditional.headers.get('Cache-Control')).toBe('public, no-cache')
    expect(conditional.headers.get('Content-Language')).toBe('zh-CN')
    expect(conditional.headers.get('Set-Cookie')).toBeNull()
    await expect(conditional.text()).resolves.toBe('')
  })

  it('still answers 304 when the inbound tag is the weak-comparable compressed form', async () => {
    const first = await invokeSiteFile(manifestLoader, '/manifest.webmanifest', BUNDLE)
    const etag = first.headers.get('ETag')!
    const conditional = await invokeSiteFile(manifestLoader, '/manifest.webmanifest', BUNDLE, {
      headers: { 'If-None-Match': `W/${etag}` },
    })
    expect(conditional.status).toBe(304)
  })

  it('answers 200 when the if-none-match names another representation', async () => {
    const conditional = await invokeSiteFile(manifestLoader, '/manifest.webmanifest', BUNDLE, {
      headers: { 'If-None-Match': '"stale"' },
    })
    expect(conditional.status).toBe(200)
  })
})

describe('manifest.webmanifest — bootstrap facts', () => {
  function bootstrapLocaleStub(locale: 'en-US' | 'zh-CN' | 'zh-TW' | 'zh-HK', bundle: Record<string, unknown>) {
    return createStubKobato({
      'public.content.bootstrap': () => ({
        ...STUB_BOOTSTRAP,
        i18n: { ...STUB_BOOTSTRAP.i18n, locale },
        blogSettings: unsafeCast<BlogSettingsBundle>(bundle),
      }),
    })
  }

  async function manifestFor(locale: 'en-US' | 'zh-CN' | 'zh-TW' | 'zh-HK', bundle: Record<string, unknown>) {
    const stub = bootstrapLocaleStub(locale, bundle)
    const { args } = makeSayakaLoaderArgs({
      stub,
      request: new Request('http://localhost/manifest.webmanifest'),
      params: {},
    })
    return manifestLoader(unsafeCast<never>(args))
  }

  it.each(['en-US', 'zh-CN', 'zh-TW', 'zh-HK'] as const)(
    'carries the %s UI language in `lang`, Content-Language and a distinct ETag',
    async (locale) => {
      const response = await manifestFor(locale, { siteIdentity: { title: 'Test Blog' }, assets: { branding: {} } })
      expect(response.headers.get('Content-Language')).toBe(locale)
      const body = (await response.text()) as string
      const json = JSON.parse(body) as { lang: string; name: string; icons: unknown[]; display: string }
      expect(json.lang).toBe(locale)
      expect(json.name).toBe('Test Blog')
      expect(json.icons).toHaveLength(2)
      expect(json.display).toBe('standalone')
      expect(response.headers.get('ETag')).toMatch(/^"[0-9a-f]{32}"$/)
    },
  )

  it('hashes the exact serialized bytes for the ETag (no object-hash / body drift)', async () => {
    const response = await manifestFor('zh-CN', { siteIdentity: { title: 'Test Blog' }, assets: { branding: {} } })
    const body = await response.text()
    const expected = `"${createHash('sha1').update(body).digest('hex').slice(0, 32)}"`
    expect(response.headers.get('ETag')).toBe(expected)
  })

  it('falls back to the hard-coded name and the bootstrap locale when the bundle is null', async () => {
    const response = await manifestFor('zh-CN', {})
    const json = JSON.parse((await response.text()) as string) as { name: string; lang: string }
    expect(json.name).toBe('Site')
    expect(json.lang).toBe('zh-CN')
  })
})
