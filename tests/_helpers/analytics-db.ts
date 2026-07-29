import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { EnrichedAccessEvent } from '@/server/domains/analytics/types'
import type { AnalyticsHandle } from '@/server/infra/analytics/duckdb'

import { ACCESS_LOG_DDL, appendAccessEvent } from '@/server/domains/analytics/services/access-log'
import { closeAnalyticsDatabase, openAnalyticsDatabase } from '@/server/infra/analytics/duckdb'

const handles: AnalyticsHandle[] = []
const dirs: string[] = []

/** Open a fresh DuckDB analytics sidecar on a temp file (migrated via
 *  the same idempotent DDL as production). */
export async function createTestAnalyticsDb(): Promise<AnalyticsHandle> {
  const dir = mkdtempSync(join(tmpdir(), 'kobato-duckdb-it-'))
  dirs.push(dir)
  const handle = await openAnalyticsDatabase(join(dir, 'analytics.duckdb'), ACCESS_LOG_DDL)
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

/**
 * Minimal access-log seed row: ts + visitorHash + path required in
 * spirit (visitorHash/path default to constants), every other column
 * optional — mirrors `EnrichedAccessEvent`'s shape.
 */
export interface SeedAccessEvent {
  ts: Date
  visitorHash?: string
  sessionId?: string | null
  ip?: string | null
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
  browserVersion?: string | null
  os?: string | null
  osVersion?: string | null
  device?: string | null
  deviceType?: string | null
  isBot?: boolean
}

/** Seed rows through the same Appender protocol the batcher uses. */
export async function seedAccessEvents(handle: AnalyticsHandle, events: SeedAccessEvent[]): Promise<void> {
  const appender = await handle.writer.createAppender('access_log')
  for (const e of events) {
    const event: EnrichedAccessEvent = {
      ts: e.ts,
      visitorHash: e.visitorHash ?? 'visitor',
      sessionId: e.sessionId ?? null,
      ip: e.ip ?? null,
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
      browserVersion: e.browserVersion ?? null,
      os: e.os ?? null,
      osVersion: e.osVersion ?? null,
      device: e.device ?? null,
      deviceType: e.deviceType ?? null,
      isBot: e.isBot ?? false,
    }
    appendAccessEvent(appender, event)
    appender.endRow()
  }
  appender.closeSync()
}

/** Wipe the access_log table between cases. */
export async function clearAccessLog(handle: AnalyticsHandle): Promise<void> {
  await handle.writer.run('DELETE FROM access_log')
}
