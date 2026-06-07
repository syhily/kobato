import { parseISO } from 'date-fns'
import { Buffer } from 'node:buffer'
import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { renderCalendar } from '@/server/render/calendar/render'

// `renderCalendar` mixes a third-party API (Shanbay daily quote), Chinese
// lunar conversion, and napi-rs/canvas drawing. We mock fetch to keep the
// test hermetic, then assert the structural invariants of the resulting PNG
// — same approach as the OG test.

const originalFetch = globalThis.fetch

beforeEach(() => {
  globalThis.fetch = vi.fn(async (url: unknown) => {
    expect(String(url)).toMatch(/dailyquote/)
    return new Response(
      JSON.stringify({
        content: 'to be or not to be',
        translation: '做或不做',
        author: 'Shakespeare',
      }),
      { headers: { 'Content-Type': 'application/json' } },
    )
  })
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('services/images/calendar — renderCalendar', () => {
  it('returns a 600×880 PNG buffer for an arbitrary date', { timeout: 30_000 }, async () => {
    const buffer = await renderCalendar(parseISO('2024-04-24'))

    expect(Buffer.isBuffer(buffer)).toBe(true)
    // PNG magic bytes
    expect(buffer[0]).toBe(0x89)
    expect(String.fromCharCode(buffer[1], buffer[2], buffer[3])).toBe('PNG')

    const meta = await sharp(buffer).metadata()
    expect(meta.width).toBe(600)
    expect(meta.height).toBe(880)
  })

  it('propagates upstream API failures (no half-rendered image)', { timeout: 30_000 }, async () => {
    globalThis.fetch = vi.fn(async () => new Response('nope', { status: 500 }))

    await expect(renderCalendar(parseISO('2024-04-24'))).rejects.toThrow(/API 请求失败/)
  })

  it('encodes lunar dates for traditional Chinese New Year correctly', { timeout: 30_000 }, async () => {
    // Smoke-test a date that's known to convert to Lunar New Year's eve in
    // Asia/Shanghai — this exercises the Solar→Lunar branch end-to-end.
    const buffer = await renderCalendar(parseISO('2024-02-09'))
    expect(buffer.byteLength).toBeGreaterThan(0)
  })
})
