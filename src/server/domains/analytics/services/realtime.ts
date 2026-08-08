import { createHash } from 'node:crypto'

import type { AnalyticsReader } from '@/server/domains/analytics/services/duckdb-sql'
import type { RealtimeEvent } from '@/shared/contracts/analytics'

import {
  EPOCH_MS_PARAM,
  epochMsParam,
  queryAnalyticsRows,
  timestampToMs,
} from '@/server/domains/analytics/services/duckdb-sql'
import { isRecord } from '@/shared/utils/type-guards'

// Per-session SSE connection bookkeeping + cap policy for
// `/api/analytics/events`, next to the tail query the stream polls.

const MAX_REALTIME_CONNECTIONS_PER_SESSION = 2

// Per-session connection counter — a plain Map is safe (single-threaded);
// keep this state off any future worker threads.
const activeSSEConnections = new Map<string, number>()

/** Cap key: session id when present, else a truncated SHA-256 of the client address — the raw IP is never used as a map key. */
export function realtimeConnectionKey(sessionId: string | null | undefined, clientAddress: string): string {
  if (sessionId) {
    return `session:${sessionId}`
  }
  return `ip:${createHash('sha256').update(clientAddress).digest('hex').slice(0, 32)}`
}

/**
 * Take one of the per-key realtime-connection slots. Returns an
 * idempotent release function, or `null` at the cap (caller maps
 * that to 429).
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

/** Test seam: total live connections across all registry keys. */
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
  // Non-record rows are skipped, never manufactured — a placeholder would
  // surface downstream as Invalid Date / NaN binding on the next poll.
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
