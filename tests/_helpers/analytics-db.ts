import { DuckDBTimestampMillisecondsValue } from '@duckdb/node-api'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { AnalyticsHandle } from '@/server/infra/analytics/duckdb'

import { ACCESS_LOG_DDL } from '@/server/domains/analytics/services/access-log-ddl'
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
    appender.appendTimestampMilliseconds(new DuckDBTimestampMillisecondsValue(BigInt(e.ts.getTime())))
    const s = (v: string | null | undefined) => (v == null ? appender.appendNull() : appender.appendVarchar(v))
    s(e.visitorHash ?? 'visitor')
    s(e.sessionId ?? null)
    s(e.ip ?? null)
    s(e.path ?? '/')
    s(e.entityType ?? null)
    e.entityId == null ? appender.appendNull() : appender.appendBigInt(BigInt(e.entityId))
    s(e.referer ?? null)
    s(e.refererHost ?? null)
    s(e.country ?? null)
    s(e.region ?? null)
    s(e.city ?? null)
    e.latitude == null ? appender.appendNull() : appender.appendDouble(e.latitude)
    e.longitude == null ? appender.appendNull() : appender.appendDouble(e.longitude)
    s(e.timezone ?? null)
    s(e.language ?? null)
    s(e.ua ?? null)
    s(e.browser ?? null)
    s(e.browserVersion ?? null)
    s(e.os ?? null)
    s(e.osVersion ?? null)
    s(e.device ?? null)
    s(e.deviceType ?? null)
    appender.appendBoolean(e.isBot ?? false)
    appender.endRow()
  }
  appender.closeSync()
}

/** Wipe the access_log table between cases. */
export async function clearAccessLog(handle: AnalyticsHandle): Promise<void> {
  await handle.writer.run('DELETE FROM access_log')
}
