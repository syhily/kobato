import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import type { SeedAccessEvent, SeedDeviceEnvClientRow } from '#/_helpers/analytics-db'

import {
  clearAccessEvents,
  closeTestAnalyticsDb,
  createTestAnalyticsDb,
  seedAccessEvents,
  seedDeviceEnvClientRows,
} from '#/_helpers/analytics-db'
import { queryMetric } from '@/server/domains/analytics/services/metric'
import { parseAnalyticsSearch } from '@/server/domains/analytics/services/query-filter'

// Environment dimensions against the real engine: the metric query INNER JOINs
// device_env_client, excludes NULL / '' bucket rows, and keeps blob/geo filters.

const handle = await createTestAnalyticsDb()
const TS = new Date('2026-01-15T11:00:00Z')
const NOW = Math.floor(Date.now() / 1000)
const RANGE = { startAt: 0, endAt: NOW }

type EnvOverrides = Partial<Omit<SeedDeviceEnvClientRow, 'eventId' | 'timestamp'>>

/** One access event plus (optionally) its beacon sidecar row. */
async function seedPair(eventId: string, env: EnvOverrides | null = null, event: Partial<SeedAccessEvent> = {}) {
  await seedAccessEvents(handle, [{ eventId, ts: TS, path: '/', country: 'US', visitorHash: eventId, ...event }])
  if (env !== null) {
    await seedDeviceEnvClientRows(handle, [{ eventId, timestamp: TS, ...env }])
  }
}

/** Order-independent name → visits map (equal visit counts have no stable order). */
function visitsByName(rows: { name: string; visits: number }[]): Record<string, number> {
  return Object.fromEntries(rows.map((row) => [row.name, row.visits]))
}

beforeEach(async () => {
  await clearAccessEvents(handle)
  await handle.writer.run('DELETE FROM device_env_client')
})

afterAll(async () => {
  await closeTestAnalyticsDb(handle)
})

describe('analytics/metric — environment dimensions', () => {
  it('buckets screen only over has_static rows and drops orphans / NULLs', async () => {
    await seedPair('00000000-0000-4000-8000-0000000000a1', { hasStatic: true, screenW: 1920, screenH: 1080 })
    await seedPair('00000000-0000-4000-8000-0000000000a2', { hasStatic: true, screenW: 1920, screenH: 1080 })
    await seedPair('00000000-0000-4000-8000-0000000000a3', { hasStatic: true, screenW: 2560, screenH: 1440 })
    // Dynamic-only beacon: no static block, so no screen values.
    await seedPair('00000000-0000-4000-8000-0000000000a4', { hasStatic: false, viewportW: 800 })
    // Orphan sidecar row: no access_events row to join with.
    await seedDeviceEnvClientRows(handle, [
      { eventId: '00000000-0000-4000-8000-0000000000a5', timestamp: TS, hasStatic: true, screenW: 3840, screenH: 2160 },
    ])

    const rows = await queryMetric(handle.reader, { range: RANGE }, 'screen')
    expect(visitsByName(rows)).toEqual({ '1920×1080': 2, '2560×1440': 1 })
    expect(rows.find((row) => row.name === '3840×2160')).toBeUndefined()
  })

  it('buckets viewport width at the boundary values', async () => {
    const widths = [480, 481, 768, 769, 1024, 1440, 1920, 1921, null]
    for (const [index, width] of widths.entries()) {
      await seedPair(`00000000-0000-4000-8000-0000000001${index.toString(16).padStart(2, '0')}`, {
        viewportW: width,
      })
    }

    expect(visitsByName(await queryMetric(handle.reader, { range: RANGE }, 'viewport'))).toEqual({
      '≤480': 1,
      '≤768': 2,
      '≤1024': 2,
      '≤1440': 1,
      '≤1920': 1,
      '>1920': 1,
    })
  })

  it('buckets DPR values and lumps unknown ratios into the other token', async () => {
    const ratios = [1, 1.5, 2, 2.5, 3, 1.25, null]
    for (const [index, dpr] of ratios.entries()) {
      await seedPair(`00000000-0000-4000-8000-0000000002${index.toString(16).padStart(2, '0')}`, { dpr })
    }

    expect(visitsByName(await queryMetric(handle.reader, { range: RANGE }, 'dpr'))).toEqual({
      '1x': 1,
      '1.5x': 1,
      '2x': 1,
      '2.5x': 1,
      '3x': 1,
      other: 1,
    })
  })

  it('buckets touch capability at 0 / 5 / 10', async () => {
    const points = [0, 1, 5, 6, 10, 11, null]
    for (const [index, touchPoints] of points.entries()) {
      await seedPair(`00000000-0000-4000-8000-0000000003${index.toString(16).padStart(2, '0')}`, { touchPoints })
    }

    // Locale-neutral tokens: the admin UI maps them to catalog labels.
    expect(visitsByName(await queryMetric(handle.reader, { range: RANGE }, 'touch'))).toEqual({
      none: 1,
      '1-5': 2,
      '6-10': 2,
      many: 1,
    })
  })

  it('keeps only reported color schemes and network types', async () => {
    await seedPair('00000000-0000-4000-8000-000000000401', { colorScheme: 'dark', netEffectiveType: '4g' })
    await seedPair('00000000-0000-4000-8000-000000000402', { colorScheme: 'dark', netEffectiveType: '3g' })
    await seedPair('00000000-0000-4000-8000-000000000403', { colorScheme: 'light', netEffectiveType: '' })
    await seedPair('00000000-0000-4000-8000-000000000404', { colorScheme: '', netEffectiveType: '' })

    expect(visitsByName(await queryMetric(handle.reader, { range: RANGE }, 'colorScheme'))).toEqual({
      dark: 2,
      light: 1,
    })
    expect(visitsByName(await queryMetric(handle.reader, { range: RANGE }, 'netEffectiveType'))).toEqual({
      '4g': 1,
      '3g': 1,
    })
  })

  it('combines blob filters with the env join', async () => {
    await seedPair('00000000-0000-4000-8000-000000000501', { viewportW: 500 }, { country: 'US' })
    await seedPair('00000000-0000-4000-8000-000000000502', { viewportW: 600 }, { country: 'US' })
    await seedPair('00000000-0000-4000-8000-000000000503', { viewportW: 700 }, { country: 'CN' })

    expect(visitsByName(await queryMetric(handle.reader, { range: RANGE, country: 'US' }, 'viewport'))).toEqual({
      '≤768': 2,
    })
    expect(visitsByName(await queryMetric(handle.reader, { range: RANGE, country: 'CN' }, 'viewport'))).toEqual({
      '≤768': 1,
    })
  })

  it('keeps the geo-unknown exclusion on env dimensions', async () => {
    await seedPair('00000000-0000-4000-8000-000000000601', { viewportW: 500 }, { country: 'US' })
    await seedPair('00000000-0000-4000-8000-000000000602', { viewportW: 500 }, { country: '' })

    expect(visitsByName(await queryMetric(handle.reader, { range: RANGE }, 'viewport'))).toEqual({ '≤768': 1 })
    expect(visitsByName(await queryMetric(handle.reader, { range: RANGE, includeUnknown: true }, 'viewport'))).toEqual({
      '≤768': 2,
    })
  })

  it('round-trips a clicked env label through parseAnalyticsSearch into a filter', async () => {
    await seedPair('00000000-0000-4000-8000-000000000701', { viewportW: 480 }, { country: 'US' })
    await seedPair('00000000-0000-4000-8000-000000000702', { viewportW: 600 }, { country: 'US' })
    await seedPair('00000000-0000-4000-8000-000000000703', { viewportW: 1600 }, { country: 'CN' })

    const input = parseAnalyticsSearch(new URLSearchParams({ startAt: '0', endAt: String(NOW), viewport: '≤480' }))
    expect(input.viewport).toBe('≤480')
    expect(visitsByName(await queryMetric(handle.reader, input, 'country'))).toEqual({ US: 1 })

    const multi = parseAnalyticsSearch(new URLSearchParams({ startAt: '0', endAt: String(NOW), viewport: '≤480,≤768' }))
    expect(visitsByName(await queryMetric(handle.reader, multi, 'country'))).toEqual({ US: 2 })
  })

  it('applies a static-dimension filter without grouping by it', async () => {
    await seedPair('00000000-0000-4000-8000-000000000801', { hasStatic: true, screenW: 1920, screenH: 1080 })
    await seedPair(
      '00000000-0000-4000-8000-000000000802',
      { hasStatic: true, screenW: 2560, screenH: 1440 },
      { path: '/other' },
    )

    const input = parseAnalyticsSearch(new URLSearchParams({ startAt: '0', endAt: String(NOW), screen: '1920×1080' }))
    expect(visitsByName(await queryMetric(handle.reader, input, 'path'))).toEqual({ '/': 1 })
  })
})
