import type { Database } from '@kobato/server/infra/db/database'

import { beforeEach, describe, expect, it, vi } from 'vitest'

// The renderers are the only heavy seam — canvas/font/quote work is
// covered by their own suites. `through` runs for real: with the
// dev-bypass buckets it always runs the loader, and the write into the
// inert db stub fails soft inside the registry (logged, swallowed).
vi.mock('@kobato/server/render/og/render', () => ({
  drawOpenGraph: vi.fn(async () => Buffer.from('og-png')),
}))
vi.mock('@kobato/server/render/calendar/render', () => ({
  renderCalendar: vi.fn(async () => Buffer.from('cal-png')),
}))

const { warn } = vi.hoisted(() => ({ warn: vi.fn() }))
vi.mock('@kobato/server/infra/logger', () => ({
  getLogger: vi.fn(() => ({ warn, debug: vi.fn(), info: vi.fn(), error: vi.fn() })),
}))

import { warmContentRenderCaches } from '@kobato/server/domains/content/render-warmup'
import { renderCalendar } from '@kobato/server/render/calendar/render'
import { drawOpenGraph } from '@kobato/server/render/og/render'
// Side-effect import: self-wires the implementation into the domain slot.
import '@kobato/server/render/warmup/content-cache'

const drawOpenGraphMock = vi.mocked(drawOpenGraph)
const renderCalendarMock = vi.mocked(renderCalendar)

const db = {} as Database

const og = { slug: 'hello', title: 'Hello', summary: 'World', cover: '/cover.png' }

beforeEach(() => {
  vi.clearAllMocks()
  drawOpenGraphMock.mockImplementation(async () => Buffer.from('og-png'))
  renderCalendarMock.mockImplementation(async () => Buffer.from('cal-png'))
})

describe('render/warmup/content-cache (through the domain seam)', () => {
  it('warms the OG bucket with the request-path render inputs', async () => {
    warmContentRenderCaches(db, og)

    await vi.waitFor(() => {
      expect(drawOpenGraphMock).toHaveBeenCalledWith(og)
    })
  })

  it('warms today’s calendar in both themes', async () => {
    warmContentRenderCaches(db, og)

    await vi.waitFor(() => {
      expect(renderCalendarMock).toHaveBeenCalledTimes(2)
    })
    const themes = renderCalendarMock.mock.calls.map(([, theme]) => theme)
    expect(themes).toContain('light')
    expect(themes).toContain('dark')
    for (const [date] of renderCalendarMock.mock.calls) {
      expect(date).toBeInstanceOf(Date)
    }
  })

  it('swallows a failed OG render — the warm never reaches its trigger', async () => {
    drawOpenGraphMock.mockRejectedValueOnce(new Error('render down'))

    expect(() => warmContentRenderCaches(db, og)).not.toThrow()
    await vi.waitFor(() => {
      expect(warn).toHaveBeenCalledWith('OG render warmup failed', expect.objectContaining({ slug: 'hello' }))
    })
  })

  it('swallows a failed calendar render', async () => {
    renderCalendarMock.mockRejectedValueOnce(new Error('quote down'))

    warmContentRenderCaches(db, og)
    await vi.waitFor(() => {
      expect(warn).toHaveBeenCalledWith('calendar render warmup failed', expect.objectContaining({ err: 'quote down' }))
    })
  })
})
