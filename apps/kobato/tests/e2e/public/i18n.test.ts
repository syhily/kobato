import { E2eClient, e2eEnv, getAdminCsrfToken, loginAdmin } from '@kobato/pack/instance/client/http'
import { callE2eRpc } from '@kobato/pack/instance/client/rpc'
import { createCanvas, loadImage } from '@napi-rs/canvas'
import { describe, expect, it } from 'vitest'

const env = e2eEnv()

const LOCALES = ['en-US', 'zh-HK', 'zh-TW', 'zh-CN'] as const
type Locale = (typeof LOCALES)[number]

const OG_LOCALE: Record<Locale, string> = {
  'en-US': 'en_US',
  'zh-HK': 'zh_HK',
  'zh-TW': 'zh_TW',
  'zh-CN': 'zh_CN',
}

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

function opaqueTag(tag: string | null): string | null {
  return tag === null ? null : tag.replace(/^W\//, '')
}

function expectHtmlLanguage(html: string, locale: Locale): void {
  expect(html).toMatch(new RegExp(`<html[^>]*\\blang="${locale}"`))
  expect(html).toMatch(new RegExp(`<meta[^>]*property="og:locale"[^>]*content="${OG_LOCALE[locale]}"`))
}

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

    const before = await anon.get('/feed')
    expect(before.status).toBe(200)
    let previousTag = before.headers.get('etag')
    expect(previousTag).toBeTruthy()
    await before.text()

    const calendarTags = new Map<Locale, string>()
    const calendarPngs = new Map<Locale, Uint8Array>()
    const feedTags = new Map<Locale, string>()
    const manifestTags = new Map<Locale, string>()
    try {
      for (const locale of LOCALES) {
        await setLocale(admin, csrfToken, locale)
        const copy = UI_COPY[locale]

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

        const feed = await anon.get('/feed')
        expect(feed.status).toBe(200)
        expect(feed.headers.get('content-language')).toBe(locale)
        const feedBody = await feed.text()
        expect(feedBody).toContain(`<language>${locale}</language>`)
        const currentTag = feed.headers.get('etag')

        expect(currentTag).toMatch(/^(?:W\/)?"[0-9a-f]{32}"$/)
        feedTags.set(locale, currentTag!)

        const stale = await anon.get('/feed', { headers: { 'if-none-match': previousTag! } })
        expect(stale.status).toBe(200)
        expect(stale.headers.get('content-language')).toBe(locale)
        expect(await stale.text()).toContain(`<language>${locale}</language>`)

        const fresh = await anon.get('/feed', { headers: { 'if-none-match': currentTag! } })
        expect(fresh.status).toBe(304)
        expect(opaqueTag(fresh.headers.get('etag'))).toBe(opaqueTag(currentTag))
        expect(fresh.headers.get('content-language')).toBe(locale)
        await fresh.text()
        previousTag = currentTag

        const atom = await anon.get('/feed/atom')
        expect(atom.status).toBe(200)
        expect(atom.headers.get('content-language')).toBe(locale)
        expect(await atom.text()).toContain(`xml:lang="${locale}"`)

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

      expect(new Set(feedTags.values()).size).toBe(LOCALES.length)
      expect(new Set(manifestTags.values()).size).toBe(LOCALES.length)
      expect(calendarTags.get('en-US')).not.toBe(calendarTags.get('zh-CN'))

      const differing = await countDifferingPixels(calendarPngs.get('en-US')!, calendarPngs.get('zh-CN')!)
      expect(differing).toBeGreaterThan(0)
    } finally {
      await setLocale(admin, csrfToken, 'zh-CN')
    }

    const restored = await anon.get('/')
    expect(restored.status).toBe(200)
    expect(restored.headers.get('content-language')).toBe('zh-CN')
    expectHtmlLanguage(await restored.text(), 'zh-CN')
  }, 60_000)
})
