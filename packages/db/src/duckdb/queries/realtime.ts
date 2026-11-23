import type { AnalyticsReader } from '@kobato/db/duckdb/connection'
import type { RealtimeEvent } from '@kobato/db/duckdb/queries/types'

import { createAnalyticsQuery, runAnalyticsQuery } from '@kobato/db/duckdb/query'
import { accessEvents } from '@kobato/db/duckdb/schema'
import { desc, sql } from 'drizzle-orm'

function emptyToNull(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

export async function queryRealtimeTail(reader: AnalyticsReader, sinceTs: Date, limit = 50): Promise<RealtimeEvent[]> {
  const rows = await runAnalyticsQuery(
    reader,
    createAnalyticsQuery({
      ts: sql<number>`epoch_ms(${accessEvents.timestamp})`,
      path: accessEvents.blob1,
      country: accessEvents.blob7,
      city: accessEvents.blob9,
      browser: accessEvents.blob12,
      os: accessEvents.blob11,
      deviceType: accessEvents.blob15,
      isBot: accessEvents.isBot,
    })
      .where(sql<boolean>`${accessEvents.timestamp} > to_timestamp(${sinceTs.getTime() / 1000})`)
      .orderBy(desc(accessEvents.timestamp))
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
