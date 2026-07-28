import { count, desc, eq } from 'drizzle-orm'

import type { Database } from '@/server/infra/db/database'
import type { NewWebmention, WebmentionRow } from '@/server/infra/db/types'

import { webmention } from '@/server/infra/db/schema/webmention'

export type WebmentionStatus = WebmentionRow['status']

export async function insertWebmention(db: Database, values: NewWebmention): Promise<WebmentionRow> {
  const now = new Date()
  const rows = await db
    .insert(webmention)
    .values({ ...values, createdAt: now, updatedAt: now })
    .returning()
  return rows[0]
}

export async function findWebmentionById(db: Database, id: number): Promise<WebmentionRow | null> {
  const rows = await db.select().from(webmention).where(eq(webmention.id, id)).limit(1)
  return rows[0] ?? null
}

export async function listWebmentionsByStatus(
  db: Database,
  status: WebmentionStatus | undefined,
  offset: number,
  limit: number,
): Promise<WebmentionRow[]> {
  return db
    .select()
    .from(webmention)
    .where(status === undefined ? undefined : eq(webmention.status, status))
    .orderBy(desc(webmention.createdAt), desc(webmention.id))
    .offset(offset)
    .limit(limit)
}

export async function countWebmentions(db: Database, status: WebmentionStatus | undefined): Promise<number> {
  const rows = await db
    .select({ count: count() })
    .from(webmention)
    .where(status === undefined ? undefined : eq(webmention.status, status))
  return rows[0]?.count ?? 0
}

export interface WebmentionStatusCounts {
  all: number
  pending: number
  approved: number
  rejected: number
}

export async function countWebmentionsByStatus(db: Database): Promise<WebmentionStatusCounts> {
  const rows = await db
    .select({ status: webmention.status, count: count() })
    .from(webmention)
    .groupBy(webmention.status)
  const counts: WebmentionStatusCounts = { all: 0, pending: 0, approved: 0, rejected: 0 }
  for (const row of rows) {
    counts[row.status] = row.count
    counts.all += row.count
  }
  return counts
}

export async function setWebmentionStatus(
  db: Database,
  id: number,
  status: WebmentionStatus,
): Promise<WebmentionRow | null> {
  const now = new Date()
  const rows = await db
    .update(webmention)
    .set({ status, moderatedAt: now, updatedAt: now })
    .where(eq(webmention.id, id))
    .returning()
  return rows[0] ?? null
}
