import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { EnrichedAccessEvent } from '@/server/domains/analytics/types'
import type { AnalyticsHandle } from '@/server/infra/analytics/duckdb'

import { ACCESS_EVENTS_DDL, appendAccessEvents } from '@/server/domains/analytics/services/access-log'
import { closeAnalyticsDatabase, openAnalyticsDatabase } from '@/server/infra/analytics/duckdb'

const handles: AnalyticsHandle[] = []
const dirs: string[] = []

/** Open a fresh DuckDB analytics sidecar on a temp file (same idempotent DDL as production). */
export async function createTestAnalyticsDb(): Promise<AnalyticsHandle> {
  const dir = mkdtempSync(join(tmpdir(), 'kobato-duckdb-it-'))
  dirs.push(dir)
  const handle = await openAnalyticsDatabase(join(dir, 'analytics.duckdb'), ACCESS_EVENTS_DDL)
  handles.push(handle)
  return handle
}

export async function closeTestAnalyticsDb(handle: AnalyticsHandle): Promise<void> {
  const index = handles.indexOf(handle)
  if (index !== -1) {
    handles.splice(index, 1)
  }
  await closeAnalyticsDatabase(handle)
}

export function closeAllTestAnalyticsDbs(): void {
  for (const handle of handles.splice(0)) {
    void closeAnalyticsDatabase(handle)
  }
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** Minimal access-events seed row: ts required, visitorHash/path default to
 *  constants, everything else optional — mirrors `EnrichedAccessEvent`
 *  (the helper writes through the same blobsMap mapping as production). */
export interface SeedAccessEvent {
  ts: Date
  visitorHash?: string
  path?: string
  entityType?: string | null
  entityId?: number | null
  referer?: string | null
  refererHost?: string | null
  country?: string | null
  region?: string | null
  city?: string | null
  latitude?: number | null
  longitude?: number | null
  timezone?: string | null
  language?: string | null
  ua?: string | null
  browser?: string | null
  browserType?: string | null
  os?: string | null
  device?: string | null
  deviceType?: string | null
  isBot?: boolean
}

/** Seed rows through the same Appender protocol the batcher uses. */
export async function seedAccessEvents(handle: AnalyticsHandle, events: SeedAccessEvent[]): Promise<void> {
  const enriched: EnrichedAccessEvent[] = events.map((e) => ({
    ts: e.ts,
    visitorHash: e.visitorHash ?? 'visitor',
    path: e.path ?? '/',
    entityType: e.entityType === 'post' || e.entityType === 'page' ? e.entityType : null,
    entityId: e.entityId ?? null,
    referer: e.referer ?? null,
    refererHost: e.refererHost ?? null,
    country: e.country ?? null,
    region: e.region ?? null,
    city: e.city ?? null,
    latitude: e.latitude ?? null,
    longitude: e.longitude ?? null,
    timezone: e.timezone ?? null,
    language: e.language ?? null,
    ua: e.ua ?? null,
    browser: e.browser ?? null,
    browserType: e.browserType ?? null,
    os: e.os ?? null,
    device: e.device ?? null,
    deviceType: e.deviceType ?? null,
    isBot: e.isBot ?? false,
  }))
  await appendAccessEvents(handle.writer, enriched)
}

/** Wipe the access_events table between cases. */
export async function clearAccessEvents(handle: AnalyticsHandle): Promise<void> {
  await handle.writer.run('DELETE FROM access_events')
}
