import { describe, expect, it } from 'vitest'

import { E2eClient, e2eEnv, getAdminCsrfToken, loginAdmin } from '#/_helpers/e2e-client'
import { callE2eRpc } from '#/_helpers/e2e-rpc'

const env = e2eEnv()

// Real-HTTP four-locale journey: switch the site language through the admin
// settings RPC and verify every public representation follows — HTML,
// RSS/Atom, manifest and the calendar PNG — plus the conditional-request
// semantics (a stale tag must NEVER answer 304 with an old language).
const LOCALES = ['en-US', 'zh-HK', 'zh-TW', 'zh-CN'] as const
type Locale = (typeof LOCALES)[number]

const OG_LOCALE: Record<Locale, string> = {
  'en-US': 'en_US',
  'zh-HK': 'zh_HK',
  'zh-TW': 'zh_TW',
  'zh-CN': 'zh_CN',
}

// Fixed date in the supported window; the URL contract is unchanged by i18n.
const CALENDAR_PATH = '/images/calendar/2026/0102.png'

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

    try {
      for (const locale of LOCALES) {
        await setLocale(admin, csrfToken, locale)

        // 1. HTML document: lang, Content-Language, og:locale.
        const home = await anon.get('/')
        expect(home.status).toBe(200)
        expect(home.headers.get('content-language')).toBe(locale)
        expectHtmlLanguage(await home.text(), locale)

        // 2. RSS: language element + header + ETag.
        const feed = await anon.get('/feed')
        expect(feed.status).toBe(200)
        expect(feed.headers.get('content-language')).toBe(locale)
        expect(await feed.text()).toContain(`<language>${locale}</language>`)
        const currentTag = feed.headers.get('etag')
        // The compression middleware weakens an entity tag on a compressed
        // response (`W/"…"`); the bytes are still what the server hashed.
        expect(currentTag).toMatch(/^(?:W\/)?"[0-9a-f]{32}"$/)

        // 3. Conditional requests: a tag from the PREVIOUS locale must be a
        //    miss (200 + current language), the current tag a 304 that still
        //    advertises the current language.
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

        // 4. Atom: xml:lang on the root feed element.
        const atom = await anon.get('/feed/atom')
        expect(atom.status).toBe(200)
        expect(atom.headers.get('content-language')).toBe(locale)
        expect(await atom.text()).toContain(`xml:lang="${locale}"`)

        // 5. Manifest: `lang` field + header.
        const manifest = await anon.get('/manifest.webmanifest')
        expect(manifest.status).toBe(200)
        expect(manifest.headers.get('content-language')).toBe(locale)
        expect((await manifest.json()) as { lang: string }).toMatchObject({ lang: locale })

        // 6. Calendar PNG: real locale-specific render, current language
        //    header, byte ETag.
        const calendar = await anon.get(CALENDAR_PATH)
        expect(calendar.status).toBe(200)
        expect(calendar.headers.get('content-type')).toBe('image/png')
        expect(calendar.headers.get('content-language')).toBe(locale)
        const calendarTag = calendar.headers.get('etag')
        expect(calendarTag).toMatch(/^(?:W\/)?"[0-9a-f]{32}"$/)
        calendarTags.set(locale, calendarTag!)
        const png = new Uint8Array(await calendar.arrayBuffer())
        expect([...png.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47])
      }

      expect(calendarTags.get('en-US')).not.toBe(calendarTags.get('zh-CN'))
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
