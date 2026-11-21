import type { EnrichedAccessEvent } from '@kobato/db/duckdb/access-events'
import type { AnalyticsHandle } from '@kobato/db/duckdb/database'
import type { DeviceEnvClientRow, DeviceEnvServerRow } from '@kobato/db/duckdb/device-env'

import { appendAccessEvents } from '@kobato/db/duckdb/access-events'
import { closeAnalyticsDatabase, openAnalyticsDatabase } from '@kobato/db/duckdb/database'
import { appendDeviceEnvClientRows, appendDeviceEnvServerRows } from '@kobato/db/duckdb/device-env'
import { ANALYTICS_DDL } from '@kobato/db/duckdb/schema'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll } from 'vitest'

const handles: AnalyticsHandle[] = []
const dirs: string[] = []

export async function createTestAnalyticsDb(): Promise<AnalyticsHandle> {
  const dir = mkdtempSync(join(tmpdir(), 'kobato-duckdb-it-'))
  dirs.push(dir)
  const handle = await openAnalyticsDatabase(join(dir, 'analytics.duckdb'), ANALYTICS_DDL)
  handles.push(handle)
  return handle
}

export async function closeTestAnalyticsDb(handle: AnalyticsHandle): Promise<void> {
  const index = handles.indexOf(handle)
  if (index !== -1) {
    handles.splice(index, 1)
  }
  // Seeded appends are awaited by the callers, so the native connections are
  // quiescent here — closing under an in-flight append is a native
  // use-after-free.
  await closeAnalyticsDatabase(handle)
}

export async function closeAllTestAnalyticsDbs(): Promise<void> {
  for (const handle of handles.splice(0)) {
    try {
      await closeAnalyticsDatabase(handle)
    } catch {}
  }
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
}

// Per-file safety net: a suite that opens handles in `beforeEach` without a
// closing hook still gets its native connections and temp dirs released.
afterAll(() => closeAllTestAnalyticsDbs())

export interface SeedAccessEvent {
  /** Pin the primary key so a device_env_client row can join on it. */
  eventId?: string
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

export async function seedAccessEvents(handle: AnalyticsHandle, events: SeedAccessEvent[]): Promise<void> {
  const enriched: EnrichedAccessEvent[] = events.map((e) => ({
    eventId: e.eventId ?? randomUUID(),
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

export async function clearAccessEvents(handle: AnalyticsHandle): Promise<void> {
  await handle.writer.run('DELETE FROM access_events')
}

export type SeedDeviceEnvServerRow = Pick<DeviceEnvServerRow, 'eventId' | 'timestamp'> &
  Partial<Omit<DeviceEnvServerRow, 'eventId' | 'timestamp'>>

export async function seedDeviceEnvServerRows(handle: AnalyticsHandle, rows: SeedDeviceEnvServerRow[]): Promise<void> {
  await appendDeviceEnvServerRows(
    handle.writer,
    rows.map((row) => ({
      uaFullVersion: '',
      platform: '',
      platformVersion: '',
      model: '',
      mobile: null,
      brands: '',
      arch: '',
      bitness: '',
      formFactors: '',
      acceptLanguage: '',
      ...row,
    })),
  )
}

export type SeedDeviceEnvClientRow = Pick<DeviceEnvClientRow, 'eventId' | 'timestamp'> &
  Partial<Omit<DeviceEnvClientRow, 'eventId' | 'timestamp'>>

export async function seedDeviceEnvClientRows(handle: AnalyticsHandle, rows: SeedDeviceEnvClientRow[]): Promise<void> {
  await appendDeviceEnvClientRows(
    handle.writer,
    rows.map((row) => ({
      screenW: null,
      screenH: null,
      availW: null,
      availH: null,
      viewportW: null,
      viewportH: null,
      dpr: null,
      colorDepth: null,
      touchPoints: null,
      pointer: '',
      hover: '',
      colorScheme: '',
      reducedMotion: null,
      netEffectiveType: '',
      netDownlink: null,
      netRtt: null,
      netSaveData: null,
      locale: '',
      timezone: '',
      hardwareConcurrency: null,
      deviceMemory: null,
      hasStatic: false,
      ...row,
    })),
  )
}
