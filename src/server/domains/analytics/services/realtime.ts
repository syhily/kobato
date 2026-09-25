import { sql } from 'kysely'
import { createHash } from 'node:crypto'

import type { AnalyticsReader } from '@/server/domains/analytics/services/analytics-sql'
import type { RealtimeEvent } from '@/shared/contracts/analytics'

import { createAnalyticsQuery, runAnalyticsQuery } from '@/server/domains/analytics/services/analytics-sql'

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

/** Blob slots store '' for "no data" — the wire DTO keeps null semantics. */
function emptyToNull(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

export async function queryRealtimeTail(reader: AnalyticsReader, sinceTs: Date, limit = 50): Promise<RealtimeEvent[]> {
  const rows = await runAnalyticsQuery(
    reader,
    createAnalyticsQuery()
      .select([
        sql<number>`epoch_ms(${sql.ref('timestamp')})`.as('ts'),
        sql.ref('blob1').as('path'),
        sql.ref('blob7').as('country'),
        sql.ref('blob9').as('city'),
        sql.ref('blob12').as('browser'),
        sql.ref('blob11').as('os'),
        sql.ref('blob15').as('deviceType'),
        sql.ref('is_bot').as('isBot'),
      ])
      .where(sql<boolean>`${sql.ref('timestamp')} > to_timestamp(${sinceTs.getTime() / 1000})`)
      .orderBy('timestamp', 'desc')
      .limit(limit),
  )
  return rows.map((row) => ({
    ts: new Date(Number(row.ts)).toISOString(),
    path: typeof row.path === 'string' ? row.path : '',
    country: emptyToNull(row.country),
    city: emptyToNull(row.city),
    browser: emptyToNull(row.browser),
    os: emptyToNull(row.os),
    deviceType: emptyToNull(row.deviceType),
    isBot: Boolean(row.isBot),
  }))
}
