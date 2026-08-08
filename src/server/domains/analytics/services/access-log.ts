import { DuckDBTimestampMillisecondsValue, type DuckDBAppender, type DuckDBConnection } from '@duckdb/node-api'

import type { EnrichedAccessEvent } from '@/server/domains/analytics/types'

/**
 * The access_log table shape — owned here (the infra DuckDB wrapper
 * receives this DDL from the caller). No secondary indexes by design.
 */
export const ACCESS_LOG_DDL = `
CREATE TABLE IF NOT EXISTS access_log (
  ts              TIMESTAMP NOT NULL,
  visitor_hash    VARCHAR NOT NULL,
  session_id      VARCHAR,
  ip              VARCHAR,
  path            VARCHAR NOT NULL,
  entity_type     VARCHAR,
  entity_id       BIGINT,
  referer         VARCHAR,
  referer_host    VARCHAR,
  country         VARCHAR,
  region          VARCHAR,
  city            VARCHAR,
  latitude        DOUBLE,
  longitude       DOUBLE,
  timezone        VARCHAR,
  language        VARCHAR,
  ua              VARCHAR,
  browser         VARCHAR,
  browser_version VARCHAR,
  os              VARCHAR,
  os_version      VARCHAR,
  device          VARCHAR,
  device_type     VARCHAR,
  is_bot          BOOLEAN NOT NULL
)
`

/** 180-day telemetry retention (plan §1.11) — fixed by design, not a setting. */
export const ACCESS_LOG_RETENTION_DAYS = 180

/**
 * Append one event as an access_log row — the single owner of the column
 * order, which must match ACCESS_LOG_DDL. Callers own the Appender
 * protocol (`endRow`/`flushSync`/`closeSync`).
 */
export function appendAccessEvent(appender: DuckDBAppender, e: EnrichedAccessEvent): void {
  appender.appendTimestampMilliseconds(new DuckDBTimestampMillisecondsValue(BigInt(e.ts.getTime())))
  const s = (v: string | null) => (v === null ? appender.appendNull() : appender.appendVarchar(v))
  s(e.visitorHash)
  s(e.sessionId)
  s(e.ip)
  s(e.path)
  s(e.entityType)
  if (e.entityId === null) {
    appender.appendNull()
  } else {
    appender.appendBigInt(BigInt(e.entityId))
  }
  s(e.referer)
  s(e.refererHost)
  s(e.country)
  s(e.region)
  s(e.city)
  if (e.latitude === null) {
    appender.appendNull()
  } else {
    appender.appendDouble(e.latitude)
  }
  if (e.longitude === null) {
    appender.appendNull()
  } else {
    appender.appendDouble(e.longitude)
  }
  s(e.timezone)
  s(e.language)
  s(e.ua)
  s(e.browser)
  s(e.browserVersion)
  s(e.os)
  s(e.osVersion)
  s(e.device)
  s(e.deviceType)
  appender.appendBoolean(e.isBot)
}

/**
 * Append a whole batch through the Appender protocol — `endRow()` per
 * row, `flushSync()` per ≤2048-row chunk. At-least-once: a mid-batch
 * failure leaves flushed rows visible while the batch dead-letters.
 */
export async function appendAccessEvents(writer: DuckDBConnection, events: EnrichedAccessEvent[]): Promise<void> {
  const appender = await writer.createAppender('access_log')
  try {
    let count = 0
    for (const event of events) {
      appendAccessEvent(appender, event)
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
