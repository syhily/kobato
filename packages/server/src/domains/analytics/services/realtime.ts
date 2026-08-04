import type { AnalyticsReader } from '@kobato/server/domains/analytics/services/duckdb-sql'
import type { RealtimeEvent } from '@kobato/shared/contracts/analytics'

import {
  EPOCH_MS_PARAM,
  epochMsParam,
  queryAnalyticsRows,
  timestampToMs,
} from '@kobato/server/domains/analytics/services/duckdb-sql'
import { isRecord } from '@kobato/shared/utils/type-guards'
import { createHash } from 'node:crypto'

// ─── SSE connection registry ─────────────────────────────────────────────
// The `/api/analytics/events` resource owns only the Hono/SSE wire
// plumbing; the per-session connection bookkeeping and the cap policy
// live here, next to the tail query the stream polls.

const MAX_REALTIME_CONNECTIONS_PER_SESSION = 2

// Per-session connection counter. Node.js is single-threaded, so a plain
// Map is safe. If worker threads are ever introduced, this state must move
// to the main thread only.
const activeSSEConnections = new Map<string, number>()

/** Cap key for one realtime consumer: the session id when the request
 *  carries one, else a truncated SHA-256 of the client address — the raw
 *  IP is never used as a map key. */
export function realtimeConnectionKey(sessionId: string | null | undefined, clientAddress: string): string {
  if (sessionId) {
    return `session:${sessionId}`
  }
  return `ip:${createHash('sha256').update(clientAddress).digest('hex').slice(0, 32)}`
}

/**
 * Take one of the per-key realtime-connection slots. Returns an
 * idempotent release function, or `null` when the key is already at
 * MAX_REALTIME_CONNECTIONS_PER_SESSION (the caller maps that to 429).
 * Acquisition is synchronous, so check-and-increment cannot race.
 */
export function acquireRealtimeConnection(key: string): (() => void) | null {
  const current = activeSSEConnections.get(key) ?? 0
  if (current >= MAX_REALTIME_CONNECTIONS_PER_SESSION) {
    return null
  }
  activeSSEConnections.set(key, current + 1)
  let released = false
  return () => {
    if (released) {
      return
    }
    released = true
    const remaining = (activeSSEConnections.get(key) ?? 0) - 1
    if (remaining <= 0) {
      activeSSEConnections.delete(key)
    } else {
      activeSSEConnections.set(key, remaining)
    }
  }
}

/** Test seam: total live connections across all registry keys, so tests
 *  can wait on the release path (abort → decrement) instead of sleeping
 *  a fixed duration and hoping the event propagated. */
export function __getRealtimeConnectionCountForTests(): number {
  let total = 0
  for (const count of activeSSEConnections.values()) {
    total += count
  }
  return total
}

export async function queryRealtimeTail(reader: AnalyticsReader, sinceTs: Date, limit = 50): Promise<RealtimeEvent[]> {
  const rows = await queryAnalyticsRows(
    reader,
    `SELECT
      ts,
      path,
      country,
      city,
      browser,
      os,
      device_type AS "deviceType",
      is_bot AS "isBot"
    FROM access_log
    WHERE ts > ${EPOCH_MS_PARAM}
    ORDER BY ts DESC
    LIMIT ?`,
    [epochMsParam(sinceTs), BigInt(limit)],
  )
  // Non-record rows are skipped, never manufactured: a placeholder with
  // `ts: ''` would surface downstream as an Invalid Date and a NaN
  // epoch binding on the next poll.
  return rows.filter(isRecord).map((row) => ({
    ts: new Date(timestampToMs(row.ts)).toISOString(),
    path: typeof row.path === 'string' ? row.path : '',
    country: row.country === null || typeof row.country === 'string' ? row.country : null,
    city: row.city === null || typeof row.city === 'string' ? row.city : null,
    browser: row.browser === null || typeof row.browser === 'string' ? row.browser : null,
    os: row.os === null || typeof row.os === 'string' ? row.os : null,
    deviceType: row.deviceType === null || typeof row.deviceType === 'string' ? row.deviceType : null,
    isBot: Boolean(row.isBot),
  }))
}
