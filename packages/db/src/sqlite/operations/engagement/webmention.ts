import type { Database } from '@kobato/db/sqlite/database'
import type { EntityTarget } from '@kobato/db/sqlite/target'
import type { NewWebmention, WebmentionRow } from '@kobato/db/sqlite/types'

import { sqliteOf } from '@kobato/db/sqlite/database'
import { isUniqueConstraintError } from '@kobato/db/sqlite/errors'
import { page } from '@kobato/db/sqlite/schema/page'
import { post } from '@kobato/db/sqlite/schema/post'
import { webmention } from '@kobato/db/sqlite/schema/webmention'
import { and, asc, count, desc, eq, sql } from 'drizzle-orm'

export type WebmentionStatus = WebmentionRow['status']

export type WebmentionStatusCounts = { all: number } & { [S in WebmentionStatus]: number }

export type WebmentionUpsertOutcome = 'inserted' | 'updated' | 'demoted'

export interface WebmentionUpsertResult {
  row: WebmentionRow
  outcome: WebmentionUpsertOutcome
}

export async function findWebmentionByPair(
  db: Database,
  sourceUrl: string,
  targetUrl: string,
): Promise<WebmentionRow | null> {
  const rows = await sqliteOf(db)
    .select()
    .from(webmention)
    .where(and(eq(webmention.sourceUrl, sourceUrl), eq(webmention.targetUrl, targetUrl)))
    .limit(1)
  return rows[0] ?? null
}

function refreshSet(values: NewWebmention, now: Date) {
  return {
    title: values.title ?? null,
    authorName: values.authorName ?? null,
    summary: values.summary ?? null,
    type: values.type ?? 'mention',
    verificationStatus: values.verificationStatus ?? 'verified',
    lastVerifiedAt: values.lastVerifiedAt ?? null,
    lastError: values.lastError ?? null,
    verifyFailStreak: values.verifyFailStreak ?? 0,
    updatedAt: now,
  }
}

export async function insertWebmentionRow(
  db: Database,
  values: NewWebmention,
  conflictSet: (now: Date) => Partial<NewWebmention>,
): Promise<{ row: WebmentionRow; raced: boolean }> {
  const now = new Date()
  try {
    const rows = await sqliteOf(db)
      .insert(webmention)
      .values({ ...values, createdAt: now, updatedAt: now })
      .returning()
    return { row: rows[0]!, raced: false }
  } catch (err) {
    if (!isUniqueConstraintError(err)) {
      throw err
    }
    const rows = await sqliteOf(db)
      .insert(webmention)
      .values({ ...values, createdAt: now, updatedAt: now })
      .onConflictDoUpdate({
        target: [webmention.sourceUrl, webmention.targetUrl],
        set: {
          ...conflictSet(now),
          status: sql`CASE WHEN ${webmention.status} = 'approved' THEN 'pending' ELSE ${webmention.status} END`,
        },
      })
      .returning()
    return { row: rows[0]!, raced: true }
  }
}

export async function upsertWebmention(db: Database, values: NewWebmention): Promise<WebmentionUpsertResult> {
  const now = new Date()
  const existing = await findWebmentionByPair(db, values.sourceUrl, values.targetUrl)

  if (existing === null) {
    const { row, raced } = await insertWebmentionRow(db, values, (n) => refreshSet(values, n))
    return { row, outcome: raced ? 'updated' : 'inserted' }
  }

  const demoted = existing.status === 'approved'
  const rows = await sqliteOf(db)
    .update(webmention)
    .set({ ...refreshSet(values, now), status: demoted ? 'pending' : existing.status })
    .where(eq(webmention.id, existing.id))
    .returning()
  return { row: rows[0], outcome: demoted ? 'demoted' : 'updated' }
}

export async function findWebmentionById(db: Database, id: number): Promise<WebmentionRow | null> {
  const rows = await sqliteOf(db).select().from(webmention).where(eq(webmention.id, id)).limit(1)
  return rows[0] ?? null
}

export async function listWebmentionsByStatus(
  db: Database,
  status: WebmentionStatus | undefined,
  offset: number,
  limit: number,
): Promise<WebmentionRow[]> {
  return sqliteOf(db)
    .select()
    .from(webmention)
    .where(status === undefined ? undefined : eq(webmention.status, status))
    .orderBy(desc(webmention.createdAt), desc(webmention.id))
    .offset(offset)
    .limit(limit)
}

export async function countWebmentions(db: Database, status: WebmentionStatus | undefined): Promise<number> {
  const rows = await sqliteOf(db)
    .select({ count: count() })
    .from(webmention)
    .where(status === undefined ? undefined : eq(webmention.status, status))
  return rows[0]?.count ?? 0
}

export async function countWebmentionsByStatus(db: Database): Promise<WebmentionStatusCounts> {
  const rows = await sqliteOf(db)
    .select({ status: webmention.status, count: count() })
    .from(webmention)
    .groupBy(webmention.status)
  const counts: WebmentionStatusCounts = { all: 0, pending: 0, approved: 0, rejected: 0, hidden: 0 }
  for (const row of rows) {
    counts[row.status] = row.count
    counts.all += row.count
  }
  return counts
}

export async function listApprovedWebmentionsForTarget(
  db: Database,
  target: EntityTarget,
  limit = 50,
): Promise<WebmentionRow[]> {
  return sqliteOf(db)
    .select()
    .from(webmention)
    .where(
      and(
        eq(webmention.targetType, target.type),
        eq(webmention.targetOwnerId, target.ownerId),
        eq(webmention.status, 'approved'),
      ),
    )
    .orderBy(asc(webmention.createdAt), asc(webmention.id))
    .limit(limit)
}

export async function setWebmentionStatus(
  db: Database,
  id: number,
  status: WebmentionStatus,
): Promise<WebmentionRow | null> {
  const now = new Date()
  const rows = await sqliteOf(db)
    .update(webmention)
    .set({
      status,
      moderatedAt: now,
      verifyFailStreak: status === 'approved' ? 0 : undefined,
      updatedAt: now,
    })
    .where(eq(webmention.id, id))
    .returning()
  return rows[0] ?? null
}

/**
 * Whether the target entity (post/page) has webmentions enabled.
 */
export async function isEntityWebmentionsEnabled(db: Database, target: EntityTarget): Promise<boolean> {
  const sdb = sqliteOf(db)
  if (target.type === 'post') {
    const rows = await sdb
      .select({ enabled: post.webmentionsEnabled })
      .from(post)
      .where(eq(post.id, target.ownerId))
      .limit(1)
    return rows[0]?.enabled ?? false
  }
  const rows = await sdb
    .select({ enabled: page.webmentionsEnabled })
    .from(page)
    .where(eq(page.id, target.ownerId))
    .limit(1)
  return rows[0]?.enabled ?? false
}
