import type { RealtimeEvent } from '@kobato/contracts/analytics.ts'
import type { AnalyticsReader } from '@kobato/db/duckdb/query.ts'

import { createAnalyticsQuery, runAnalyticsQuery } from '@kobato/db/duckdb/query.ts'
import { sql } from 'kysely'

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
    'realtime',
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
