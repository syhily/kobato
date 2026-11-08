import { HTTPException } from 'hono/http-exception'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Database } from '@/server/infra/db/database'
import type { AppLocale } from '@/shared/i18n/locales'

import { APP_VERSION } from '@/shared/config/version'

// The db handle is only forwarded to the mocked cache module — a stand-in
// is enough for the unit scope.
const db = {} as Database

const PNG = Buffer.from('png-bytes')

function options(overrides: Partial<{ theme: 'light' | 'dark'; locale: AppLocale; ifNoneMatch: string | null }> = {}) {
  return { theme: 'light' as const, locale: 'zh-CN' as AppLocale, ifNoneMatch: null, ...overrides }
}

describe('serveCalendar', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  let through: ReturnType<typeof vi.fn>
  let renderCalendar: ReturnType<typeof vi.fn>

  async function importServeCalendar() {
    through = vi.fn().mockResolvedValue(PNG)
    renderCalendar = vi.fn().mockResolvedValue(PNG)
    vi.doMock('@/server/infra/http/status', () => ({
      pngResponse: vi.fn((buffer: Buffer, headers?: HeadersInit) => {
        const merged = new Headers(headers)
        merged.set('Content-Type', 'image/png')
        return new Response(new Uint8Array(buffer), { headers: merged })
      }),
    }))
    vi.doMock('@/server/infra/cache/registry', () => ({ through }))
    vi.doMock('@/server/render/calendar/render', () => ({ renderCalendar }))
    const { serveCalendar } = await import('@/server/http/resources/calendar')
    return serveCalendar
  }

  it('returns a PNG with the revalidating cache semantics', async () => {
    const serveCalendar = await importServeCalendar()
    const res = await serveCalendar(db, { year: '2026', time: '0617' }, options())

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/png')
    expect(res.headers.get('Cache-Control')).toBe('public, no-cache')
    expect(res.headers.get('Content-Language')).toBe('zh-CN')
    expect(res.headers.get('ETag')).toMatch(/^"[0-9a-f]{32}"$/)
  })

  it('caches by date + theme + locale + representation version, and passes the locale to the renderer', async () => {
    const serveCalendar = await importServeCalendar()
    await serveCalendar(db, { year: '2026', time: '0617' }, options({ theme: 'dark', locale: 'zh-TW' }))

    expect(through).toHaveBeenCalledWith(
      db,
      'calendar',
      { date: '2026-06-17', theme: 'dark', locale: 'zh-TW', version: APP_VERSION },
      expect.any(Function),
    )
    // The loader closure is what calls the renderer — invoke it to prove the locale is threaded.
    const loader = through.mock.calls[0]![3] as () => Promise<Buffer>
    await loader()
    expect(renderCalendar).toHaveBeenCalledWith(expect.any(Date), 'dark', 'zh-TW')
  })

  it.each(['en-US', 'zh-CN', 'zh-TW', 'zh-HK'] as const)(
    'keys and heads the %s variant independently',
    async (locale) => {
      const serveCalendar = await importServeCalendar()
      const res = await serveCalendar(db, { year: '2026', time: '0617' }, options({ locale }))

      expect(res.headers.get('Content-Language')).toBe(locale)
      expect(through.mock.calls[0]![2]).toMatchObject({ locale, version: APP_VERSION })
    },
  )

  it('answers 304 on a matching If-None-Match, with the current locale heads and no body', async () => {
    const serveCalendar = await importServeCalendar()
    const first = await serveCalendar(db, { year: '2026', time: '0617' }, options())
    const etag = first.headers.get('ETag')!

    const cached = await serveCalendar(db, { year: '2026', time: '0617' }, options({ ifNoneMatch: etag }))

    expect(cached.status).toBe(304)
    expect(cached.headers.get('ETag')).toBe(etag)
    expect(cached.headers.get('Cache-Control')).toBe('public, no-cache')
    expect(cached.headers.get('Content-Language')).toBe('zh-CN')
    expect(await cached.text()).toBe('')
  })

  it('matches a comma-separated / weak If-None-Match list, not just one exact value', async () => {
    const serveCalendar = await importServeCalendar()
    const first = await serveCalendar(db, { year: '2026', time: '0617' }, options())
    const etag = first.headers.get('ETag')!

    const listed = await serveCalendar(
      db,
      { year: '2026', time: '0617' },
      options({ ifNoneMatch: `"other", W/${etag}` }),
    )
    expect(listed.status).toBe(304)

    const wildcard = await serveCalendar(db, { year: '2026', time: '0617' }, options({ ifNoneMatch: '*' }))
    expect(wildcard.status).toBe(304)

    const stale = await serveCalendar(db, { year: '2026', time: '0617' }, options({ ifNoneMatch: '"stale"' }))
    expect(stale.status).toBe(200)
  })

  it('responds 304 on a CACHE HIT without regenerating the render', async () => {
    const serveCalendar = await importServeCalendar()
    // First call is a miss (loader runs), later calls are hits (cached bytes).
    let loads = 0
    through.mockImplementation((async (...args: unknown[]) => {
      loads += 1
      const loader = args[3] as () => Promise<Buffer>
      return loads === 1 ? loader() : PNG
    }) as never)

    const first = await serveCalendar(db, { year: '2026', time: '0617' }, options())
    const etag = first.headers.get('ETag')!
    expect(renderCalendar).toHaveBeenCalledTimes(1)

    const cached = await serveCalendar(db, { year: '2026', time: '0617' }, options({ ifNoneMatch: etag }))
    expect(cached.status).toBe(304)
    expect(cached.headers.get('ETag')).toBe(etag)
    expect(renderCalendar).toHaveBeenCalledTimes(1)
  })

  it('throws 404 for malformed year', async () => {
    const serveCalendar = await importServeCalendar()
    const error = await serveCalendar(db, { year: 'ab' }, options()).catch((err: unknown) => err)
    expect(error).toBeInstanceOf(HTTPException)
    expect(error).toMatchObject({ status: 404 })
  })

  it('throws 404 for invalid calendar date', async () => {
    const serveCalendar = await importServeCalendar()
    await expect(serveCalendar(db, { year: '2026', time: '0230' }, options())).rejects.toMatchObject({
      status: 404,
    })
  })

  it('throws 404 for an invalid time', async () => {
    const serveCalendar = await importServeCalendar()
    await expect(serveCalendar(db, { year: '2026', time: 'abcd' }, options())).rejects.toMatchObject({
      status: 404,
    })
  })

  it('throws 404 for a year below the supported window', async () => {
    const serveCalendar = await importServeCalendar()
    await expect(serveCalendar(db, { year: '1969', time: '0617' }, options())).rejects.toMatchObject({
      status: 404,
    })
  })

  it('throws 404 for a year above the supported window', async () => {
    const serveCalendar = await importServeCalendar()
    await expect(serveCalendar(db, { year: '2101', time: '0617' }, options())).rejects.toMatchObject({
      status: 404,
    })
  })

  it('serves the window edges (1970 and 2100)', async () => {
    const serveCalendar = await importServeCalendar()
    for (const year of ['1970', '2100']) {
      const res = await serveCalendar(db, { year, time: '0617' }, options())
      expect(res.status).toBe(200)
    }
  })

  it('throws 404 for a date that rolls over', async () => {
    const serveCalendar = await importServeCalendar()
    await expect(serveCalendar(db, { year: '2026', time: '1399' }, options())).rejects.toMatchObject({
      status: 404,
    })
  })
})
