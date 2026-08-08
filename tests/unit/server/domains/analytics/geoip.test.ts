import { beforeEach, describe, expect, it, vi } from 'vitest'

// Memoization rules: a not-installed database stays memoized, but a
// failed open is never cached.
const knobs = vi.hoisted(() => ({ installed: true }))
const readerOpen = vi.hoisted(() => vi.fn())
const existsSyncMock = vi.hoisted(() => vi.fn(() => knobs.installed))

vi.mock('@maxmind/geoip2-node', () => ({ Reader: { open: readerOpen } }))
vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs')
  return { ...actual, existsSync: existsSyncMock }
})
vi.mock('@/server/infra/paths', () => ({
  MAXMIND_DB_PATH: '/tmp/maxmind/GeoLite2-City.mmdb',
  isPathInside: () => true,
}))
vi.mock('@/server/infra/logger', () => ({
  getLogger: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() })),
}))

import { getGeoReader, resetGeoReader } from '@/server/domains/analytics/geoip'

describe('analytics/geoip — reader memoization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetGeoReader()
    knobs.installed = true
  })

  it('memoizes the not-installed state', async () => {
    knobs.installed = false
    expect(await getGeoReader()).toBeNull()
    expect(await getGeoReader()).toBeNull()
    expect(existsSyncMock).toHaveBeenCalledTimes(1)
    expect(readerOpen).not.toHaveBeenCalled()
  })

  it('memoizes a successfully opened reader', async () => {
    const reader = {}
    readerOpen.mockResolvedValue(reader)
    expect(await getGeoReader()).toBe(reader)
    expect(await getGeoReader()).toBe(reader)
    expect(readerOpen).toHaveBeenCalledTimes(1)
  })

  it('does NOT memoize a failed open — the next lookup retries', async () => {
    const reader = {}
    readerOpen.mockRejectedValueOnce(new Error('transient I/O')).mockResolvedValueOnce(reader)

    expect(await getGeoReader()).toBeNull()
    expect(await getGeoReader()).toBe(reader)
    expect(readerOpen).toHaveBeenCalledTimes(2)
  })
})
