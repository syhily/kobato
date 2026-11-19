import {
  BOOLEAN,
  DOUBLE,
  DuckDBDataChunk,
  DuckDBTimestampTZValue,
  DuckDBUUIDValue,
  INTEGER,
  TIMESTAMPTZ,
  UUID,
  VARCHAR,
  type DuckDBConnection,
  type DuckDBType,
  type DuckDBValue,
} from '@duckdb/node-api'

/**
 * `device_env_server` — the request-side half of the environment analytics: one
 * row per event, written by the enrich pipeline in the same batch as the main
 * row. Holds the high-entropy UA Client Hints (`Accept-CH` negotiated) plus the
 * complete Accept-Language list, which the main table's blob6 truncates to its
 * first token. A session's first hits arrive without hints, so empty strings are
 * legitimate values, not missing writes.
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

const timestampMicros = (timestamp: Date): DuckDBTimestampTZValue =>
  new DuckDBTimestampTZValue(BigInt(timestamp.getTime()) * 1000n)

const DEVICE_ENV_SERVER_CHUNK_TYPES: DuckDBType[] = [
  UUID,
  TIMESTAMPTZ,
  VARCHAR,
  VARCHAR,
  VARCHAR,
  VARCHAR,
  BOOLEAN,
  VARCHAR,
  VARCHAR,
  VARCHAR,
  VARCHAR,
  VARCHAR,
]

const DEVICE_ENV_CLIENT_CHUNK_TYPES: DuckDBType[] = [
  UUID,
  TIMESTAMPTZ,
  INTEGER,
  INTEGER,
  INTEGER,
  INTEGER,
  INTEGER,
  INTEGER,
  DOUBLE,
  INTEGER,
  INTEGER,
  VARCHAR,
  VARCHAR,
  VARCHAR,
  BOOLEAN,
  VARCHAR,
  DOUBLE,
  INTEGER,
  BOOLEAN,
  VARCHAR,
  VARCHAR,
  INTEGER,
  DOUBLE,
  BOOLEAN,
]

function deviceEnvServerColumns(rows: DeviceEnvServerRow[]): DuckDBValue[][] {
  return [
    rows.map((row) => DuckDBUUIDValue.fromUint128(uuidToUint128(row.eventId))),
    rows.map((row) => timestampMicros(row.timestamp)),
    rows.map((row) => row.uaFullVersion),
    rows.map((row) => row.platform),
    rows.map((row) => row.platformVersion),
    rows.map((row) => row.model),
    rows.map((row) => row.mobile),
    rows.map((row) => row.brands),
    rows.map((row) => row.arch),
    rows.map((row) => row.bitness),
    rows.map((row) => row.formFactors),
    rows.map((row) => row.acceptLanguage),
  ]
}

function deviceEnvClientColumns(rows: DeviceEnvClientRow[]): DuckDBValue[][] {
  return [
    rows.map((row) => DuckDBUUIDValue.fromUint128(uuidToUint128(row.eventId))),
    rows.map((row) => timestampMicros(row.timestamp)),
    rows.map((row) => row.screenW),
    rows.map((row) => row.screenH),
    rows.map((row) => row.availW),
    rows.map((row) => row.availH),
    rows.map((row) => row.viewportW),
    rows.map((row) => row.viewportH),
    rows.map((row) => row.dpr),
    rows.map((row) => row.colorDepth),
    rows.map((row) => row.touchPoints),
    rows.map((row) => row.pointer),
    rows.map((row) => row.hover),
    rows.map((row) => row.colorScheme),
    rows.map((row) => row.reducedMotion),
    rows.map((row) => row.netEffectiveType),
    rows.map((row) => row.netDownlink),
    rows.map((row) => row.netRtt),
    rows.map((row) => row.netSaveData),
    rows.map((row) => row.locale),
    rows.map((row) => row.timezone),
    rows.map((row) => row.hardwareConcurrency),
    rows.map((row) => row.deviceMemory),
    rows.map((row) => row.hasStatic),
  ]
}

async function appendRows(
  writer: DuckDBConnection,
  table: 'device_env_server' | 'device_env_client',
  types: DuckDBType[],
  columns: DuckDBValue[][],
): Promise<void> {
  const appender = await writer.createAppender(table)
  try {
    const rowCount = columns[0]?.length ?? 0
    for (let offset = 0; offset < rowCount; offset += 2048) {
      const chunk = DuckDBDataChunk.create(types)
      chunk.setColumns(columns.map((column) => column.slice(offset, offset + 2048)))
      appender.appendDataChunk(chunk)
      appender.flushSync()
    }
  } finally {
    appender.closeSync()
  }
}

export async function appendDeviceEnvServerRows(writer: DuckDBConnection, rows: DeviceEnvServerRow[]): Promise<void> {
  await appendRows(writer, 'device_env_server', DEVICE_ENV_SERVER_CHUNK_TYPES, deviceEnvServerColumns(rows))
}

export async function appendDeviceEnvClientRows(writer: DuckDBConnection, rows: DeviceEnvClientRow[]): Promise<void> {
  await appendRows(writer, 'device_env_client', DEVICE_ENV_CLIENT_CHUNK_TYPES, deviceEnvClientColumns(rows))
}

export async function existingDeviceEnvEventIds(writer: DuckDBConnection, eventIds: string[]): Promise<Set<string>> {
  const found = new Set<string>()
  for (let offset = 0; offset < eventIds.length; offset += 2048) {
    const slice = eventIds.slice(offset, offset + 2048)
    const placeholders = slice.map(() => '?').join(', ')
    const result = await writer.runAndReadAll(
      `SELECT event_id::VARCHAR AS id FROM device_env_client WHERE event_id IN (${placeholders})`,
      slice,
    )
    for (const row of result.getRowObjects()) {
      found.add(String(row.id))
    }
  }
  return found
}
