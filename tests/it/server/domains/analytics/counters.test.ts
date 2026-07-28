import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { clearAccessLog, closeTestAnalyticsDb, createTestAnalyticsDb, seedAccessEvents } from '#/_helpers/analytics-db'
import { queryCounters } from '@/server/domains/analytics/services/counters'

const handle = await createTestAnalyticsDb()

const DAY = 24 * 60 * 60

function dateAt(iso: string): Date {
  return new Date(iso)
}

function unixAt(iso: string): number {
  return Math.floor(dateAt(iso).getTime() / 1000)
}

afterAll(async () => {
  await closeTestAnalyticsDb(handle)
})

beforeEach(async () => {
  await clearAccessLog(handle)
})

describe('analytics counters from raw access_log', () => {
  it('counts rows for ranges ≤ 24 hours', async () => {
    const now = unixAt('2026-01-15T12:00:00.000Z')
    const startAt = now - DAY

    await seedAccessEvents(handle, [
      { ts: dateAt('2026-01-15T11:00:00.000Z'), visitorHash: 'a', path: '/' },
      { ts: dateAt('2026-01-15T10:00:00.000Z'), visitorHash: 'b', path: '/post/1' },
      // Outside the 24-hour window.
      { ts: dateAt('2026-01-14T11:59:59.000Z'), visitorHash: 'c', path: '/' },
    ])

    const result = await queryCounters(handle.reader, { range: { startAt, endAt: now }, filters: {} })

    expect(result).toEqual({ visits: 2, visitors: 2, referers: 0 })
  })

  it('counts distinct referer hosts', async () => {
    const now = unixAt('2026-01-15T12:00:00.000Z')
    const startAt = now - DAY

    await seedAccessEvents(handle, [
      { ts: dateAt('2026-01-15T11:00:00.000Z'), visitorHash: 'a', path: '/', refererHost: 'google.com' },
      { ts: dateAt('2026-01-15T10:00:00.000Z'), visitorHash: 'b', path: '/', refererHost: 'google.com' },
      { ts: dateAt('2026-01-15T09:00:00.000Z'), visitorHash: 'c', path: '/', refererHost: 'x.com' },
      { ts: dateAt('2026-01-15T08:00:00.000Z'), visitorHash: 'd', path: '/', refererHost: null },
      { ts: dateAt('2026-01-15T07:00:00.000Z'), visitorHash: 'e', path: '/', refererHost: '' },
    ])

    const result = await queryCounters(handle.reader, { range: { startAt, endAt: now }, filters: {} })

    expect(result).toEqual({ visits: 5, visitors: 5, referers: 2 })
  })

  it('applies metric filters to the where clause', async () => {
    const now = unixAt('2026-01-15T12:00:00.000Z')
    const startAt = now - DAY

    await seedAccessEvents(handle, [
      { ts: dateAt('2026-01-15T11:00:00.000Z'), visitorHash: 'a', path: '/', country: 'US' },
      { ts: dateAt('2026-01-15T10:00:00.000Z'), visitorHash: 'b', path: '/', country: 'CN' },
    ])

    const result = await queryCounters(handle.reader, { range: { startAt, endAt: now }, filters: { country: 'US' } })

    expect(result).toEqual({ visits: 1, visitors: 1, referers: 0 })
  })
})
