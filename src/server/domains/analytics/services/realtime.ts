import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { sql } from 'drizzle-orm'

import type { RealtimeEvent } from '@/shared/contracts/analytics'

import { isRecord } from '@/shared/utils/type-guards'

export async function queryRealtimeTail(db: NodePgDatabase, sinceTs: Date, limit = 50): Promise<RealtimeEvent[]> {
  const result = await db.execute(sql`
    SELECT
      ts,
      path,
      country,
      city,
      browser,
      os,
      device_type AS "deviceType",
      is_bot AS "isBot"
    FROM access_log
    WHERE ts > ${sinceTs}
    ORDER BY ts DESC
    LIMIT ${limit}
  `)
  return result.rows.map((row) => {
    if (!isRecord(row)) {
      return { ts: '', path: '', country: null, city: null, browser: null, os: null, deviceType: null, isBot: false }
    }
    const ts = row.ts
    return {
      ts: (ts instanceof Date
        ? ts
        : new Date(typeof ts === 'string' || typeof ts === 'number' ? ts : String(ts))
      ).toISOString(),
      path: typeof row.path === 'string' ? row.path : '',
      country: row.country === null || typeof row.country === 'string' ? row.country : null,
      city: row.city === null || typeof row.city === 'string' ? row.city : null,
      browser: row.browser === null || typeof row.browser === 'string' ? row.browser : null,
      os: row.os === null || typeof row.os === 'string' ? row.os : null,
      deviceType: row.deviceType === null || typeof row.deviceType === 'string' ? row.deviceType : null,
      isBot: Boolean(row.isBot),
    }
  })
}
