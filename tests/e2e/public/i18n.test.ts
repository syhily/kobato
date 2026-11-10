import { createCanvas, loadImage } from '@napi-rs/canvas'
import { describe, expect, it } from 'vitest'

import { E2eClient, e2eEnv, getAdminCsrfToken, loginAdmin } from '#/_helpers/e2e-client'
import { callE2eRpc } from '#/_helpers/e2e-rpc'

const env = e2eEnv()

// Every expected string is a literal from the catalog, never computed with
// the same Intl call the implementation uses; a stale tag must never answer
// 304 with an old language.
const LOCALES = ['en-US', 'zh-HK', 'zh-TW', 'zh-CN'] as const
type Locale = (typeof LOCALES)[number]

const OG_LOCALE: Record<Locale, string> = {
  'en-US': 'en_US',
  'zh-HK': 'zh_HK',
  'zh-TW': 'zh_TW',
  'zh-CN': 'zh_CN',
}

/** Catalog literals rendered by BaseLayout / ErrorView on every public page. */
const UI_COPY: Record<
  Locale,
  { skipToContent: string; themeToDark: string; notFoundTitle: string; notFoundDescription: string }
> = {
  'en-US': {
    skipToContent: 'Skip to main content',
    themeToDark: 'Switch to dark mode',
    notFoundTitle: 'Page not found',
    notFoundDescription: 'Sorry, we could not find what you were looking for.',
  },
  'zh-HK': {
    skipToContent: '跳至主要內容',
    themeToDark: '切換至深色模式',
    notFoundTitle: '找不到頁面',
    notFoundDescription: '抱歉，找不到你要的內容…',
  },
  'zh-TW': {
    skipToContent: '跳至主要內容',
    themeToDark: '切換至深色模式',
    notFoundTitle: '找不到頁面',
    notFoundDescription: '抱歉，找不到你要找的內容…',
  },
  'zh-CN': {
    skipToContent: '跳转到主要内容',
    themeToDark: '切换到暗色模式',
    notFoundTitle: '未找到页面',
    notFoundDescription: '抱歉，没有你要找的内容…',
  },
}

// Fixed date in the supported window; the URL contract is unchanged by i18n.
const CALENDAR_PATH = '/images/calendar/2026/0102.png'
const MISSING_PATH = '/i18n-e2e-missing-page'

async function setLocale(admin: E2eClient, csrfToken: string, locale: Locale): Promise<void> {
  const result = await callE2eRpc<{ section: unknown }>(
    admin,
    '/admin/settings/update',
    { section: 'general', payload: { locale } },
    csrfToken,
  )
  expect(result.status).toBe(200)
}

/** RFC weak comparison: a compressed 200 carries `W/"…"`, its 304 does not. */
function opaqueTag(tag: string | null): string | null {
  return tag === null ? null : tag.replace(/^W\//, '')
}

function expectHtmlLanguage(html: string, locale: Locale): void {
  expect(html).toMatch(new RegExp(`<html[^>]*\\blang="${locale}"`))
  expect(html).toMatch(new RegExp(`<meta[^>]*property="og:locale"[^>]*content="${OG_LOCALE[locale]}"`))
}

/**
 * Count pixels that actually differ between two rendered calendars. This is
 * the locale-dependent visible output: en-US drops the lunar line and the 宜
 * line and writes Latin month/weekday names, so the two PNGs cannot coincide.
 */
async function countDifferingPixels(left: Uint8Array, right: Uint8Array): Promise<number> {
  const [leftImage, rightImage] = await Promise.all([loadImage(Buffer.from(left)), loadImage(Buffer.from(right))])
  expect([rightImage.width, rightImage.height]).toEqual([leftImage.width, leftImage.height])

  const read = (image: Awaited<ReturnType<typeof loadImage>>) => {
    const canvas = createCanvas(image.width, image.height)
    const ctx = canvas.getContext('2d')
    ctx.drawImage(image, 0, 0)
    return ctx.getImageData(0, 0, image.width, image.height).data
  }
  const [leftPixels, rightPixels] = [read(leftImage), read(rightImage)]

  let differing = 0
  for (let offset = 0; offset < leftPixels.length; offset += 4) {
    if (
      leftPixels[offset] !== rightPixels[offset] ||
      leftPixels[offset + 1] !== rightPixels[offset + 1] ||
      leftPixels[offset + 2] !== rightPixels[offset + 2] ||
      leftPixels[offset + 3] !== rightPixels[offset + 3]
    ) {
      differing += 1
    }
  }
  return differing
}

describe('four-locale public representations (HTTP e2e)', () => {
  it('switches the language and every surface follows, then restores zh-CN', async () => {
    const admin = new E2eClient(env.baseUrl)
    const { res } = await loginAdmin(admin, env)
    expect(res.status).toBe(302)
    const csrfToken = await getAdminCsrfToken(admin)

    const anon = new E2eClient(env.baseUrl)
    // The pre-switch (seeded zh-CN) feed tag: the first conditional probe uses it.
    const before = await anon.get('/feed')
    expect(before.status).toBe(200)
    let previousTag = before.headers.get('etag')
    expect(previousTag).toBeTruthy()
    await before.text()

    // zh-HK and zh-TW share the hand-reviewed traditional copy, so their
    // calendar bytes may legitimately match; English must differ.
    const calendarTags = new Map<Locale, string>()
    const calendarPngs = new Map<Locale, Uint8Array>()
    const feedTags = new Map<Locale, string>()
    const manifestTags = new Map<Locale, string>()

    try {
      for (const locale of LOCALES) {
        await setLocale(admin, csrfToken, locale)
        const copy = UI_COPY[locale]

        // Real chrome copy rendered through the UI catalog, never a fallback.
        const home = await anon.get('/')
        expect(home.status).toBe(200)
        expect(home.headers.get('content-language')).toBe(locale)
        const homeHtml = await home.text()
        expectHtmlLanguage(homeHtml, locale)
        expect(homeHtml).toContain(copy.skipToContent)
        expect(homeHtml).toContain(copy.themeToDark)

        const missing = await anon.get(MISSING_PATH)
        expect(missing.status).toBe(404)
        const missingHtml = await missing.text()
        expect(missingHtml).toContain(copy.notFoundTitle)
        expect(missingHtml).toContain(copy.notFoundDescription)

        // `<language>` is the feed's locale-bearing field; titles/descriptions
        // are site-authored content and deliberately never translated.
        const feed = await anon.get('/feed')
        expect(feed.status).toBe(200)
        expect(feed.headers.get('content-language')).toBe(locale)
        const feedBody = await feed.text()
        expect(feedBody).toContain(`<language>${locale}</language>`)
        const currentTag = feed.headers.get('etag')
        // The compression middleware weakens an entity tag on a compressed
        // response (`W/"…"`); the bytes are still what the server hashed.
        expect(currentTag).toMatch(/^(?:W\/)?"[0-9a-f]{32}"$/)
        feedTags.set(locale, currentTag!)

        // A tag from the PREVIOUS locale must be a miss (200 + current
        // language), the current tag a 304 that still advertises it.
        const stale = await anon.get('/feed', { headers: { 'if-none-match': previousTag! } })
        expect(stale.status).toBe(200)
        expect(stale.headers.get('content-language')).toBe(locale)
        expect(await stale.text()).toContain(`<language>${locale}</language>`)

        const fresh = await anon.get('/feed', { headers: { 'if-none-match': currentTag! } })
        expect(fresh.status).toBe(304)
        // The 304 has no body to compress and carries the strong form.
        expect(opaqueTag(fresh.headers.get('etag'))).toBe(opaqueTag(currentTag))
        expect(fresh.headers.get('content-language')).toBe(locale)
        await fresh.text()
        previousTag = currentTag

        const atom = await anon.get('/feed/atom')
        expect(atom.status).toBe(200)
        expect(atom.headers.get('content-language')).toBe(locale)
        expect(await atom.text()).toContain(`xml:lang="${locale}"`)

        // `lang` is the manifest's locale-bearing field; name/short_name stay
        // the site's authored title.
        const manifest = await anon.get('/manifest.webmanifest')
        expect(manifest.status).toBe(200)
        expect(manifest.headers.get('content-language')).toBe(locale)
        const manifestBody = await manifest.text()
        expect(JSON.parse(manifestBody)).toMatchObject({
          name: 'Kobato Smoke',
          short_name: 'Kobato Smoke',
          lang: locale,
          display: 'standalone',
        })
        manifestTags.set(locale, manifest.headers.get('etag')!)

        const calendar = await anon.get(CALENDAR_PATH)
        expect(calendar.status).toBe(200)
        expect(calendar.headers.get('content-type')).toBe('image/png')
        expect(calendar.headers.get('content-language')).toBe(locale)
        const calendarTag = calendar.headers.get('etag')
        expect(calendarTag).toMatch(/^(?:W\/)?"[0-9a-f]{32}"$/)
        calendarTags.set(locale, calendarTag!)
        const png = new Uint8Array(await calendar.arrayBuffer())
        expect([...png.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47])
        calendarPngs.set(locale, png)
      }

      // Each body changes with the language: four distinct representation tags.
      expect(new Set(feedTags.values()).size).toBe(LOCALES.length)
      expect(new Set(manifestTags.values()).size).toBe(LOCALES.length)
      expect(calendarTags.get('en-US')).not.toBe(calendarTags.get('zh-CN'))

      // The calendar paint itself is localized, not just its headers. Font
      // availability and rasterization determine the differing pixel count,
      // so only require a visible difference, not a platform-specific area.
      const differing = await countDifferingPixels(calendarPngs.get('en-US')!, calendarPngs.get('zh-CN')!)
      expect(differing).toBeGreaterThan(0)
    } finally {
      // Never leak another language into the shared instance's other journeys.
      await setLocale(admin, csrfToken, 'zh-CN')
    }

    const restored = await anon.get('/')
    expect(restored.status).toBe(200)
    expect(restored.headers.get('content-language')).toBe('zh-CN')
    expectHtmlLanguage(await restored.text(), 'zh-CN')
  }, 60_000)
})
