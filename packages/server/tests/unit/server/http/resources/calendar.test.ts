import type { AppLocale } from '@kobato/i18n/locales.ts'
import type { BlogSettingsBundle } from '@kobato/settings/types.ts'

import { APP_VERSION } from '@kobato/distribution/app.ts'
import { countEntryFiles, wipeCache } from '@kobato/server/infra/cache/file-store.ts'
import { __resetMemoryCacheForTests } from '@kobato/server/infra/cache/memory-store.ts'
import { resetCacheCounterMemo } from '@kobato/server/infra/cache/registry.ts'
import { TEST_BLOG_SETTINGS_BUNDLE } from '@kobato/server/tests/utils/blog-settings.ts'
import { representationRevisionsFor } from '@kobato/settings/representation-scopes.ts'
import { HTTPException } from 'hono/http-exception'
import sharp from 'sharp'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const throughSpy = vi.spyOn(await import('@kobato/server/infra/cache/registry.ts'), 'through')
// The renderer has its own real-canvas coverage; here it is replaced with a
// cheap real PNG so the route + cache semantics stay fast to exercise.
const PNG = await sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 1, g: 2, b: 3 } } })
  .png()
  .toBuffer()
const renderCalendarSpy = vi
  .spyOn(await import('@kobato/server/render/calendar/render.ts'), 'renderCalendar')
  .mockImplementation(async () => PNG)

function options(
  overrides: Partial<{
    theme: 'light' | 'dark'
    locale: AppLocale
    settingsRevision: string
    settings: BlogSettingsBundle | null
    ifNoneMatch: string | null
  }> = {},
) {
  return {
    theme: 'light' as const,
    locale: 'zh-CN' as AppLocale,
    settingsRevision: representationRevisionsFor(TEST_BLOG_SETTINGS_BUNDLE).calendar,
    settings: TEST_BLOG_SETTINGS_BUNDLE,
    ifNoneMatch: null,
    ...overrides,
  }
}

async function importServeCalendar() {
  return (await import('@kobato/server/http/resources/calendar.ts')).serveCalendar
}

describe('serveCalendar', () => {
  beforeEach(async () => {
    throughSpy.mockClear()
    renderCalendarSpy.mockClear()
    vi.unstubAllEnvs()
    await wipeCache()
    __resetMemoryCacheForTests()
    resetCacheCounterMemo()
  })

  it('returns a PNG with the revalidating cache semantics', async () => {
    const serve = await importServeCalendar()
    const res = await serve({ year: '2026', time: '0617' }, options())

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/png')
    expect(res.headers.get('Cache-Control')).toBe('public, no-cache')
    expect(res.headers.get('Content-Language')).toBe('zh-CN')
    expect(res.headers.get('ETag')).toMatch(/^"[0-9a-f]{32}"$/)
  })

  it('caches by date + theme + locale + version + settings revision, and passes the pinned bundle to the renderer', async () => {
    const serve = await importServeCalendar()
    const settings = TEST_BLOG_SETTINGS_BUNDLE
    await serve({ year: '2026', time: '0617' }, options({ theme: 'dark', locale: 'zh-TW', settings }))

    expect(throughSpy).toHaveBeenCalledWith(
      'calendar',
      {
        date: '2026-06-17',
        theme: 'dark',
        locale: 'zh-TW',
        version: APP_VERSION,
        settingsRevision: expect.any(String) as string,
      },
      expect.any(Function),
    )
    expect(renderCalendarSpy).toHaveBeenCalledWith(expect.any(Date), 'dark', 'zh-TW', settings)
  })

  it('moves the key when the settings revision advances', async () => {
    const serve = await importServeCalendar()
    await serve({ year: '2026', time: '0617' }, options({ settingsRevision: 'boot-test:0000000010' }))
    await serve({ year: '2026', time: '0617' }, options({ settingsRevision: 'boot-test:0000000011' }))

    const first = throughSpy.mock.calls[0]![1] as { settingsRevision: string }
    const second = throughSpy.mock.calls[1]![1] as { settingsRevision: string }
    expect(first.settingsRevision).toBe('boot-test:0000000010')
    expect(second.settingsRevision).toBe('boot-test:0000000011')
    expect(first).not.toEqual(second)
  })

  it.each(['en-US', 'zh-CN', 'zh-TW', 'zh-HK'] as const)(
    'keys and heads the %s variant independently',
    async (locale) => {
      const serve = await importServeCalendar()
      const res = await serve({ year: '2026', time: '0617' }, options({ locale }))

      expect(res.headers.get('Content-Language')).toBe(locale)
      expect(throughSpy.mock.calls[0]![1]).toMatchObject({ locale, version: APP_VERSION })
    },
  )

  it('answers 304 on a matching If-None-Match, with the current locale heads and no body', async () => {
    const serve = await importServeCalendar()
    const first = await serve({ year: '2026', time: '0617' }, options())
    const etag = first.headers.get('ETag')!

    const cached = await serve({ year: '2026', time: '0617' }, options({ ifNoneMatch: etag }))

    expect(cached.status).toBe(304)
    expect(cached.headers.get('ETag')).toBe(etag)
    expect(cached.headers.get('Cache-Control')).toBe('public, no-cache')
    expect(cached.headers.get('Content-Language')).toBe('zh-CN')
    expect(await cached.text()).toBe('')
  })

  it('matches a comma-separated / weak If-None-Match list, not just one exact value', async () => {
    const serve = await importServeCalendar()
    const first = await serve({ year: '2026', time: '0617' }, options())
    const etag = first.headers.get('ETag')!

    const listed = await serve({ year: '2026', time: '0617' }, options({ ifNoneMatch: `"other", W/${etag}` }))
    expect(listed.status).toBe(304)

    const wildcard = await serve({ year: '2026', time: '0617' }, options({ ifNoneMatch: '*' }))
    expect(wildcard.status).toBe(304)

    const stale = await serve({ year: '2026', time: '0617' }, options({ ifNoneMatch: '"stale"' }))
    expect(stale.status).toBe(200)
  })

  it('responds 304 on a CACHE HIT without regenerating the render', async () => {
    // The calendar bucket bypasses cache reads outside PROD (dev always
    // re-renders); the hit path is the production behavior under test.
    vi.stubEnv('PROD', true as never)
    const serve = await importServeCalendar()
    const first = await serve({ year: '2026', time: '0617' }, options())
    const etag = first.headers.get('ETag')!
    expect(renderCalendarSpy).toHaveBeenCalledTimes(1)
    // writeEntry is fire-and-forget; wait until the entry file has landed.
    await vi.waitFor(async () => {
      expect(await countEntryFiles('calendar')).toBe(1)
    })

    const cached = await serve({ year: '2026', time: '0617' }, options({ ifNoneMatch: etag }))
    expect(cached.status).toBe(304)
    expect(cached.headers.get('ETag')).toBe(etag)
    expect(renderCalendarSpy).toHaveBeenCalledTimes(1)
  })

  it('throws 404 for malformed year', async () => {
    const serve = await importServeCalendar()
    const error = await serve({ year: 'ab' }, options()).catch((err: unknown) => err)
    expect(error).toBeInstanceOf(HTTPException)
    expect(error).toMatchObject({ status: 404 })
  })

  it('throws 404 for invalid calendar date', async () => {
    const serve = await importServeCalendar()
    await expect(serve({ year: '2026', time: '0230' }, options())).rejects.toMatchObject({ status: 404 })
  })

  it('throws 404 for an invalid time', async () => {
    const serve = await importServeCalendar()
    await expect(serve({ year: '2026', time: 'abcd' }, options())).rejects.toMatchObject({ status: 404 })
  })

  it('throws 404 for a year below the supported window', async () => {
    const serve = await importServeCalendar()
    await expect(serve({ year: '1969', time: '0617' }, options())).rejects.toMatchObject({ status: 404 })
  })

  it('throws 404 for a year above the supported window', async () => {
    const serve = await importServeCalendar()
    await expect(serve({ year: '2101', time: '0617' }, options())).rejects.toMatchObject({ status: 404 })
  })

  it('serves the window edges (1970 and 2100)', async () => {
    const serve = await importServeCalendar()
    for (const year of ['1970', '2100']) {
      const res = await serve({ year, time: '0617' }, options())
      expect(res.status).toBe(200)
    }
  })

  it('throws 404 for a date that rolls over', async () => {
    const serve = await importServeCalendar()
    await expect(serve({ year: '2026', time: '1399' }, options())).rejects.toMatchObject({ status: 404 })
  })
})
