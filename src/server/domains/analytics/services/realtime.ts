import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { sql } from 'drizzle-orm'

import type { RealtimeEvent } from '@/shared/contracts/analytics'

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
    const r = row as {
      ts: Date | string
      path: string
      country: string | null
      city: string | null
      browser: string | null
      os: string | null
      deviceType: string | null
      isBot: boolean
    }
    return {
      ts: (r.ts instanceof Date ? r.ts : new Date(r.ts)).toISOString(),
      path: r.path,
      country: r.country,
      city: r.city,
      browser: r.browser,
      os: r.os,
      deviceType: r.deviceType,
      isBot: r.isBot,
    }
  })
}
