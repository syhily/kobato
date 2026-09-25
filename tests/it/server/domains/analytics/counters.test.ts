import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import {
  clearAccessEvents,
  closeTestAnalyticsDb,
  createTestAnalyticsDb,
  seedAccessEvents,
} from '#/_helpers/analytics-db'
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
  await clearAccessEvents(handle)
})

describe('analytics counters from raw access_events', () => {
  it('counts rows for ranges ≤ 24 hours', async () => {
    const now = unixAt('2026-01-15T12:00:00.000Z')
    const startAt = now - DAY

    await seedAccessEvents(handle, [
      { ts: dateAt('2026-01-15T11:00:00.000Z'), visitorHash: 'a', path: '/' },
      { ts: dateAt('2026-01-15T10:00:00.000Z'), visitorHash: 'b', path: '/post/1' },
      // Outside the 24-hour window.
      { ts: dateAt('2026-01-14T11:59:59.000Z'), visitorHash: 'c', path: '/' },
    ])

    const result = await queryCounters(handle.reader, { range: { startAt, endAt: now } })

    expect(result).toEqual({ visits: 2, visitors: 2, referers: 0 })
  })

  it('counts distinct referer hosts, skipping empty slots', async () => {
    const now = unixAt('2026-01-15T12:00:00.000Z')
    const startAt = now - DAY

    await seedAccessEvents(handle, [
      { ts: dateAt('2026-01-15T11:00:00.000Z'), visitorHash: 'a', path: '/', refererHost: 'google.com' },
      { ts: dateAt('2026-01-15T10:00:00.000Z'), visitorHash: 'b', path: '/', refererHost: 'google.com' },
      { ts: dateAt('2026-01-15T09:00:00.000Z'), visitorHash: 'c', path: '/', refererHost: 'x.com' },
      { ts: dateAt('2026-01-15T08:00:00.000Z'), visitorHash: 'd', path: '/', refererHost: null },
      { ts: dateAt('2026-01-15T07:00:00.000Z'), visitorHash: 'e', path: '/', refererHost: '' },
    ])

    const result = await queryCounters(handle.reader, { range: { startAt, endAt: now } })

    expect(result).toEqual({ visits: 5, visitors: 5, referers: 2 })
  })

  it('excludes bot rows unconditionally', async () => {
    const now = unixAt('2026-01-15T12:00:00.000Z')
    const startAt = now - DAY

    await seedAccessEvents(handle, [
      { ts: dateAt('2026-01-15T11:00:00.000Z'), visitorHash: 'a', path: '/' },
      { ts: dateAt('2026-01-15T10:00:00.000Z'), visitorHash: 'bot', path: '/', isBot: true },
    ])

    const result = await queryCounters(handle.reader, { range: { startAt, endAt: now } })

    expect(result).toEqual({ visits: 1, visitors: 1, referers: 0 })
  })

  it('applies dimension filters to the where clause', async () => {
    const now = unixAt('2026-01-15T12:00:00.000Z')
    const startAt = now - DAY

    await seedAccessEvents(handle, [
      { ts: dateAt('2026-01-15T11:00:00.000Z'), visitorHash: 'a', path: '/', country: 'US' },
      { ts: dateAt('2026-01-15T10:00:00.000Z'), visitorHash: 'b', path: '/', country: 'CN' },
    ])

    const result = await queryCounters(handle.reader, { range: { startAt, endAt: now }, country: 'US' })

    expect(result).toEqual({ visits: 1, visitors: 1, referers: 0 })
  })

  it('scopes to an entity through index1', async () => {
    const now = unixAt('2026-01-15T12:00:00.000Z')
    const startAt = now - DAY

    await seedAccessEvents(handle, [
      { ts: dateAt('2026-01-15T11:00:00.000Z'), visitorHash: 'a', path: '/post/1', entityType: 'post', entityId: 1 },
      { ts: dateAt('2026-01-15T10:00:00.000Z'), visitorHash: 'b', path: '/post/2', entityType: 'post', entityId: 2 },
      { ts: dateAt('2026-01-15T09:00:00.000Z'), visitorHash: 'c', path: '/' },
    ])

    const result = await queryCounters(handle.reader, {
      range: { startAt, endAt: now },
      entityType: 'post',
      entityId: 1,
    })

    expect(result).toEqual({ visits: 1, visitors: 1, referers: 0 })
  })

  it('treats a comma-separated dimension filter as an IN list', async () => {
    const now = unixAt('2026-01-15T12:00:00.000Z')
    const startAt = now - DAY

    await seedAccessEvents(handle, [
      { ts: dateAt('2026-01-15T11:00:00.000Z'), visitorHash: 'a', path: '/', country: 'US' },
      { ts: dateAt('2026-01-15T10:00:00.000Z'), visitorHash: 'b', path: '/', country: 'CN' },
      { ts: dateAt('2026-01-15T09:00:00.000Z'), visitorHash: 'c', path: '/', country: 'DE' },
    ])

    const result = await queryCounters(handle.reader, { range: { startAt, endAt: now }, country: 'US,CN' })

    expect(result).toEqual({ visits: 2, visitors: 2, referers: 0 })
  })
})
