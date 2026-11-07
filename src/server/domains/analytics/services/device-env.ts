import { DuckDBTimestampTZValue, DuckDBUUIDValue, type DuckDBAppender, type DuckDBConnection } from '@duckdb/node-api'

/**
 * `device_env_server` — the request-side half of ADR-0006's dual-track
 * environment analytics. One row per event, written by the enrich
 * pipeline in the same batch as the main row: the high-entropy UA Client
 * Hints (`Accept-CH` negotiated) plus the complete Accept-Language
 * preference list, which the main table's blob6 truncates to its first
 * token. First hits of a session arrive without hints, so the empty
 * strings are legitimate values, not missing writes.
 */
export const DEVICE_ENV_SERVER_DDL = `
CREATE TABLE IF NOT EXISTS device_env_server (
  event_id UUID PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL,
  ua_full_version VARCHAR NOT NULL DEFAULT '',
  platform VARCHAR NOT NULL DEFAULT '',
  platform_version VARCHAR NOT NULL DEFAULT '',
  model VARCHAR NOT NULL DEFAULT '',
  mobile BOOLEAN,
  brands VARCHAR NOT NULL DEFAULT '',
  arch VARCHAR NOT NULL DEFAULT '',
  bitness VARCHAR NOT NULL DEFAULT '',
  form_factors VARCHAR NOT NULL DEFAULT '',
  accept_language VARCHAR NOT NULL DEFAULT ''
)
`

/**
 * `device_env_client` — the beacon-reported half: one row per received
 * beacon, keyed by the same event id. Static fields (screen / touch /
 * locale / hardware) are reported once per browser session
 * (`has_static = true`); dynamic fields ride every page view. Numeric
 * dimensions store raw values — panels bucket at query time. NULL means
 * the client did not report that field.
 */
export const DEVICE_ENV_CLIENT_DDL = `
CREATE TABLE IF NOT EXISTS device_env_client (
  event_id UUID PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL,
  screen_w INTEGER,
  screen_h INTEGER,
  avail_w INTEGER,
  avail_h INTEGER,
  viewport_w INTEGER,
  viewport_h INTEGER,
  dpr DOUBLE,
  color_depth INTEGER,
  touch_points INTEGER,
  pointer VARCHAR NOT NULL DEFAULT '',
  hover VARCHAR NOT NULL DEFAULT '',
  color_scheme VARCHAR NOT NULL DEFAULT '',
  reduced_motion BOOLEAN,
  net_effective_type VARCHAR NOT NULL DEFAULT '',
  net_downlink DOUBLE,
  net_rtt INTEGER,
  net_save_data BOOLEAN,
  locale VARCHAR NOT NULL DEFAULT '',
  timezone VARCHAR NOT NULL DEFAULT '',
  hardware_concurrency INTEGER,
  device_memory DOUBLE,
  has_static BOOLEAN NOT NULL
)
`

/** One `device_env_server` row. `timestamp` matches the main event's instant (retention cutoff). */
export interface DeviceEnvServerRow {
  eventId: string
  timestamp: Date
  uaFullVersion: string
  platform: string
  platformVersion: string
  model: string
  /** NULL = no `Sec-CH-UA-Mobile` hint was received. */
  mobile: boolean | null
  /** Raw `Sec-CH-UA-Full-Version-List` value. */
  brands: string
  arch: string
  bitness: string
  /** Raw `Sec-CH-UA-Form-Factors` header value (e.g. `"Desktop", "Laptop"`), truncated to 128 chars. */
  formFactors: string
  /** Full Accept-Language preference list, truncated to 256 characters. */
  acceptLanguage: string
}

/** One `device_env_client` row. NULL = the beacon did not report that field. */
export interface DeviceEnvClientRow {
  eventId: string
  timestamp: Date
  screenW: number | null
  screenH: number | null
  availW: number | null
  availH: number | null
  viewportW: number | null
  viewportH: number | null
  dpr: number | null
  colorDepth: number | null
  touchPoints: number | null
  /** `'coarse'` / `'fine'` / `''`. */
  pointer: string
  /** `'hover'` / `'none'` / `''`. */
  hover: string
  /** `'dark'` / `'light'` / `''`. */
  colorScheme: string
  reducedMotion: boolean | null
  /** `'slow-2g'` / `'2g'` / `'3g'` / `'4g'` / `''`. */
  netEffectiveType: string
  netDownlink: number | null
  netRtt: number | null
  netSaveData: boolean | null
  locale: string
  timezone: string
  hardwareConcurrency: number | null
  deviceMemory: number | null
  /** Whether this beacon carried the session-static block. */
  hasStatic: boolean
}

const uuidToUint128 = (uuid: string): bigint => BigInt(`0x${uuid.replaceAll('-', '')}`)

const appendTimestamp = (appender: DuckDBAppender, timestamp: Date): void => {
  appender.appendTimestampTZ(new DuckDBTimestampTZValue(BigInt(timestamp.getTime()) * 1000n))
}

const appendNullableInteger = (appender: DuckDBAppender, value: number | null): void => {
  if (value === null) {
    appender.appendNull()
  } else {
    appender.appendInteger(value)
  }
}

const appendNullableDouble = (appender: DuckDBAppender, value: number | null): void => {
  if (value === null) {
    appender.appendNull()
  } else {
    appender.appendDouble(value)
  }
}

const appendNullableBoolean = (appender: DuckDBAppender, value: boolean | null): void => {
  if (value === null) {
    appender.appendNull()
  } else {
    appender.appendBoolean(value)
  }
}

/** Append one device_env_server row — the single owner of the column order. */
export function appendDeviceEnvServerRow(appender: DuckDBAppender, row: DeviceEnvServerRow): void {
  appender.appendUUID(DuckDBUUIDValue.fromUint128(uuidToUint128(row.eventId)))
  appendTimestamp(appender, row.timestamp)
  appender.appendVarchar(row.uaFullVersion)
  appender.appendVarchar(row.platform)
  appender.appendVarchar(row.platformVersion)
  appender.appendVarchar(row.model)
  appendNullableBoolean(appender, row.mobile)
  appender.appendVarchar(row.brands)
  appender.appendVarchar(row.arch)
  appender.appendVarchar(row.bitness)
  appender.appendVarchar(row.formFactors)
  appender.appendVarchar(row.acceptLanguage)
}

/** Append one device_env_client row — the single owner of the column order. */
export function appendDeviceEnvClientRow(appender: DuckDBAppender, row: DeviceEnvClientRow): void {
  appender.appendUUID(DuckDBUUIDValue.fromUint128(uuidToUint128(row.eventId)))
  appendTimestamp(appender, row.timestamp)
  appendNullableInteger(appender, row.screenW)
  appendNullableInteger(appender, row.screenH)
  appendNullableInteger(appender, row.availW)
  appendNullableInteger(appender, row.availH)
  appendNullableInteger(appender, row.viewportW)
  appendNullableInteger(appender, row.viewportH)
  appendNullableDouble(appender, row.dpr)
  appendNullableInteger(appender, row.colorDepth)
  appendNullableInteger(appender, row.touchPoints)
  appender.appendVarchar(row.pointer)
  appender.appendVarchar(row.hover)
  appender.appendVarchar(row.colorScheme)
  appendNullableBoolean(appender, row.reducedMotion)
  appender.appendVarchar(row.netEffectiveType)
  appendNullableDouble(appender, row.netDownlink)
  appendNullableInteger(appender, row.netRtt)
  appendNullableBoolean(appender, row.netSaveData)
  appender.appendVarchar(row.locale)
  appender.appendVarchar(row.timezone)
  appendNullableInteger(appender, row.hardwareConcurrency)
  appendNullableDouble(appender, row.deviceMemory)
  appender.appendBoolean(row.hasStatic)
}

/**
 * Append a whole batch through the Appender protocol — `endRow()` per
 * row, `flushSync()` per ≤2048-row chunk. At-least-once: a mid-batch
 * failure leaves flushed rows visible while the batch dead-letters.
 */
async function appendRows<T>(
  writer: DuckDBConnection,
  table: 'device_env_server' | 'device_env_client',
  rows: T[],
  appendRow: (appender: DuckDBAppender, row: T) => void,
): Promise<void> {
  const appender = await writer.createAppender(table)
  try {
    let count = 0
    for (const row of rows) {
      appendRow(appender, row)
      appender.endRow()
      count++
      if (count % 2048 === 0) {
        appender.flushSync()
      }
    }
  } finally {
    appender.closeSync()
  }
}

export async function appendDeviceEnvServerRows(writer: DuckDBConnection, rows: DeviceEnvServerRow[]): Promise<void> {
  await appendRows(writer, 'device_env_server', rows, appendDeviceEnvServerRow)
}

export async function appendDeviceEnvClientRows(writer: DuckDBConnection, rows: DeviceEnvClientRow[]): Promise<void> {
  await appendRows(writer, 'device_env_client', rows, appendDeviceEnvClientRow)
}
