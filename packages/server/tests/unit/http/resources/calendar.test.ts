import type { Database } from '@kobato/server/infra/db/database'

import { HTTPException } from 'hono/http-exception'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The db handle is only forwarded to the mocked cache module — a stand-in
// is enough for the unit scope.
const db = {} as Database

describe('serveCalendar', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  async function importServeCalendar() {
    const { serveCalendar } = await import('@kobato/server/http/resources/calendar')
    return serveCalendar
  }

  it('returns a png response for a valid date', async () => {
    vi.doMock('@kobato/server/infra/http/png-response', () => ({
      pngResponse: vi.fn(
        (buffer: Buffer) => new Response(new Uint8Array(buffer), { headers: { 'Content-Type': 'image/png' } }),
      ),
    }))
    vi.doMock('@kobato/server/infra/cache/registry', () => ({
      through: vi.fn().mockResolvedValue(Buffer.from('png-bytes')),
    }))
    vi.doMock('@kobato/server/render/calendar/render', () => ({
      renderCalendar: vi.fn().mockResolvedValue(Buffer.from('png-bytes')),
    }))

    const serveCalendar = await importServeCalendar()
    const res = await serveCalendar(db, { year: '2026', time: '0617' }, 'light', {
      'Cache-Control': 'public, max-age=86400',
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/png')
  })

  it('caches through the calendar declaration with the parsed date and theme', async () => {
    const through = vi.fn().mockResolvedValue(Buffer.from('dark-png'))
    vi.doMock('@kobato/server/infra/http/png-response', () => ({
      pngResponse: vi.fn(
        (buffer: Buffer) => new Response(new Uint8Array(buffer), { headers: { 'Content-Type': 'image/png' } }),
      ),
    }))
    vi.doMock('@kobato/server/infra/cache/registry', () => ({ through }))
    vi.doMock('@kobato/server/render/calendar/render', () => ({
      renderCalendar: vi.fn().mockResolvedValue(Buffer.from('dark-png')),
    }))

    const serveCalendar = await importServeCalendar()
    await serveCalendar(db, { year: '2026', time: '0617' }, 'dark', {})
    expect(through).toHaveBeenCalledWith(db, 'calendar', { date: '2026-06-17', theme: 'dark' }, expect.any(Function))
  })

  it('throws 404 for malformed year', async () => {
    const serveCalendar = await importServeCalendar()
    const error = await serveCalendar(db, { year: 'ab' }, 'light', {}).catch((err: unknown) => err)
    expect(error).toBeInstanceOf(HTTPException)
    expect(error).toMatchObject({ status: 404 })
  })

  it('throws 404 for invalid calendar date', async () => {
    const serveCalendar = await importServeCalendar()
    await expect(serveCalendar(db, { year: '2026', time: '0230' }, 'light', {})).rejects.toMatchObject({
      status: 404,
    })
  })

  it('throws 404 for an invalid time', async () => {
    const serveCalendar = await importServeCalendar()
    await expect(serveCalendar(db, { year: '2026', time: 'abcd' }, 'light', {})).rejects.toMatchObject({
      status: 404,
    })
  })

  it('throws 404 for a date that rolls over', async () => {
    const serveCalendar = await importServeCalendar()
    await expect(serveCalendar(db, { year: '2026', time: '1399' }, 'light', {})).rejects.toMatchObject({
      status: 404,
    })
  })
})
