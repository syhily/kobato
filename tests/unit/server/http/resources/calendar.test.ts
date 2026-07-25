import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { beforeEach, describe, expect, it, vi } from 'vitest'

// The db handle is only forwarded to the mocked loadBuffer — a stand-in is
// enough for the unit scope.
const db = {} as NodePgDatabase

describe('serveCalendar', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  async function importServeCalendar() {
    const { serveCalendar } = await import('@/server/http/resources/calendar')
    return serveCalendar
  }

  it('returns a png response for a valid date', async () => {
    vi.doMock('@/server/infra/http/status', () => ({
      notFound: vi.fn(() => {
        throw new Error('notFound should not be called')
      }),
      pngResponse: vi.fn(
        (buffer: Buffer) => new Response(new Uint8Array(buffer), { headers: { 'Content-Type': 'image/png' } }),
      ),
    }))
    vi.doMock('@/server/infra/cache/buffer-cache', () => ({
      loadBuffer: vi.fn().mockResolvedValue(Buffer.from('png-bytes')),
    }))
    vi.doMock('@/server/render/calendar/render', () => ({
      renderCalendar: vi.fn().mockResolvedValue(Buffer.from('png-bytes')),
    }))
    vi.doMock('@/shared/config/getters', () => ({
      getCacheSettings: vi.fn().mockReturnValue({
        cache: { calendar: { prefix: 'calendar:', ttlSeconds: 86400 } },
      }),
    }))

    const serveCalendar = await importServeCalendar()
    const res = await serveCalendar(db, { year: '2026', time: '0617' }, 'light', {
      'Cache-Control': 'public, max-age=86400',
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/png')
  })

  it('uses dark theme suffix in cache key', async () => {
    const loadBuffer = vi.fn().mockResolvedValue(Buffer.from('dark-png'))
    vi.doMock('@/server/infra/http/status', () => ({
      notFound: vi.fn(() => {
        throw new Error('notFound should not be called')
      }),
      pngResponse: vi.fn(
        (buffer: Buffer) => new Response(new Uint8Array(buffer), { headers: { 'Content-Type': 'image/png' } }),
      ),
    }))
    vi.doMock('@/server/infra/cache/buffer-cache', () => ({ loadBuffer }))
    vi.doMock('@/server/render/calendar/render', () => ({
      renderCalendar: vi.fn().mockResolvedValue(Buffer.from('dark-png')),
    }))
    vi.doMock('@/shared/config/getters', () => ({
      getCacheSettings: vi.fn().mockReturnValue({
        cache: { calendar: { prefix: 'cal:', ttlSeconds: 3600 } },
      }),
    }))

    const serveCalendar = await importServeCalendar()
    await serveCalendar(db, { year: '2026', time: '0617' }, 'dark', {})
    expect(loadBuffer).toHaveBeenCalledWith(db, 'cal:2026-06-17-dark', expect.any(Function), 3600, 'calendar')
  })

  it('throws 404 for malformed year', async () => {
    const notFound = vi.fn(() => {
      throw new Response('Not Found', { status: 404 })
    })
    vi.doMock('@/server/infra/http/status', () => ({ notFound, pngResponse: vi.fn() }))
    vi.doMock('@/shared/config/getters', () => ({
      getCacheSettings: vi.fn().mockReturnValue({
        cache: { calendar: { prefix: 'calendar:', ttlSeconds: 86400 } },
      }),
    }))

    const serveCalendar = await importServeCalendar()
    await expect(serveCalendar(db, { year: 'ab' }, 'light', {})).rejects.toMatchObject({
      status: 404,
    })
    expect(notFound).toHaveBeenCalled()
  })

  it('throws 404 for invalid calendar date', async () => {
    const notFound = vi.fn(() => {
      throw new Response('Not Found', { status: 404 })
    })
    vi.doMock('@/server/infra/http/status', () => ({ notFound, pngResponse: vi.fn() }))
    vi.doMock('@/shared/config/getters', () => ({
      getCacheSettings: vi.fn().mockReturnValue({
        cache: { calendar: { prefix: 'calendar:', ttlSeconds: 86400 } },
      }),
    }))

    const serveCalendar = await importServeCalendar()
    await expect(serveCalendar(db, { year: '2026', time: '0230' }, 'light', {})).rejects.toMatchObject({
      status: 404,
    })
    expect(notFound).toHaveBeenCalled()
  })

  it('throws 404 for an invalid time', async () => {
    const notFound = vi.fn(() => {
      throw new Response('Not Found', { status: 404 })
    })
    vi.doMock('@/server/infra/http/status', () => ({ notFound, pngResponse: vi.fn() }))
    vi.doMock('@/shared/config/getters', () => ({
      getCacheSettings: vi.fn().mockReturnValue({
        cache: { calendar: { prefix: 'calendar:', ttlSeconds: 86400 } },
      }),
    }))

    const serveCalendar = await importServeCalendar()
    await expect(serveCalendar(db, { year: '2026', time: 'abcd' }, 'light', {})).rejects.toMatchObject({
      status: 404,
    })
    expect(notFound).toHaveBeenCalled()
  })

  it('throws 404 for a date that rolls over', async () => {
    const notFound = vi.fn(() => {
      throw new Response('Not Found', { status: 404 })
    })
    vi.doMock('@/server/infra/http/status', () => ({ notFound, pngResponse: vi.fn() }))
    vi.doMock('@/shared/config/getters', () => ({
      getCacheSettings: vi.fn().mockReturnValue({
        cache: { calendar: { prefix: 'calendar:', ttlSeconds: 86400 } },
      }),
    }))

    const serveCalendar = await importServeCalendar()
    await expect(serveCalendar(db, { year: '2026', time: '1399' }, 'light', {})).rejects.toMatchObject({
      status: 404,
    })
    expect(notFound).toHaveBeenCalled()
  })
})
