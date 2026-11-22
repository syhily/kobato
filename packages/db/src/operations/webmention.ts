import type { Database } from '@kobato/db/database'
import type { EntityTarget } from '@kobato/db/target'
import type { NewWebmention, WebmentionRow } from '@kobato/db/types'

import { sqliteOf } from '@kobato/db/database'
import { isUniqueConstraintError } from '@kobato/db/errors'
import { page } from '@kobato/db/schema/page'
import { post } from '@kobato/db/schema/post'
import { webmention } from '@kobato/db/schema/webmention'
import { and, asc, count, desc, eq, gte, isNull, lt, lte, or, sql } from 'drizzle-orm'

export type WebmentionStatus = WebmentionRow['status']

export type WebmentionStatusCounts = { all: number } & { [S in WebmentionStatus]: number }

export type WebmentionUpsertOutcome = 'inserted' | 'updated' | 'demoted'

export interface WebmentionUpsertResult {
  row: WebmentionRow
  outcome: WebmentionUpsertOutcome
}

async function findWebmentionByPair(db: Database, sourceUrl: string, targetUrl: string): Promise<WebmentionRow | null> {
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

async function insertWebmentionRow(
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

export const WEBMENTION_REVERIFY_INTERVAL_MS = 24 * 60 * 60 * 1000

export const WEBMENTION_HIDE_STREAK = 7

const MAX_LAST_ERROR_LENGTH = 500

function truncateVerifyError(message: string): string {
  return message.length > MAX_LAST_ERROR_LENGTH ? `${message.slice(0, MAX_LAST_ERROR_LENGTH)}…` : message
}

export async function upsertWebmentionVerificationFailure(
  db: Database,
  values: {
    sourceUrl: string
    targetUrl: string
    targetType: 'post' | 'page'
    targetOwnerId: number
    error: string
  },
): Promise<WebmentionRow> {
  const now = new Date()
  const failureSet = {
    verificationStatus: 'failed' as const,
    lastVerifiedAt: now,
    lastError: truncateVerifyError(values.error),
    verifyFailStreak: 0,
    updatedAt: now,
  }
  const rowValues: NewWebmention = {
    sourceUrl: values.sourceUrl,
    targetUrl: values.targetUrl,
    status: 'pending',
    type: 'mention',
    targetType: values.targetType,
    targetOwnerId: values.targetOwnerId,
    ...failureSet,
  }
  const existing = await findWebmentionByPair(db, values.sourceUrl, values.targetUrl)
  if (existing === null) {
    const { row } = await insertWebmentionRow(db, rowValues, () => failureSet)
    return row
  }
  const rows = await sqliteOf(db)
    .update(webmention)
    .set({
      verificationStatus: 'failed',
      lastVerifiedAt: now,
      lastError: failureSet.lastError,
      updatedAt: now,
      status: existing.status === 'approved' ? 'pending' : existing.status,
    })
    .where(eq(webmention.id, existing.id))
    .returning()
  return rows[0]!
}

function reverifyCycleWhere() {
  return or(
    eq(webmention.status, 'approved'),
    and(
      eq(webmention.status, 'pending'),
      eq(webmention.verificationStatus, 'failed'),
      lt(webmention.verifyFailStreak, WEBMENTION_HIDE_STREAK),
    ),
  )
}

export async function pickWebmentionsDueForReverify(db: Database, now: Date, limit: number): Promise<WebmentionRow[]> {
  const cutoff = new Date(now.getTime() - WEBMENTION_REVERIFY_INTERVAL_MS)
  return sqliteOf(db)
    .select()
    .from(webmention)
    .where(and(reverifyCycleWhere(), or(isNull(webmention.lastVerifiedAt), lte(webmention.lastVerifiedAt, cutoff))))
    .orderBy(asc(webmention.lastVerifiedAt), asc(webmention.id))
    .limit(limit)
}

export async function hideExhaustedPendingWebmentions(db: Database): Promise<number> {
  const rows = await sqliteOf(db)
    .update(webmention)
    .set({ status: 'hidden', updatedAt: new Date() })
    .where(
      and(
        eq(webmention.status, 'pending'),
        eq(webmention.verificationStatus, 'failed'),
        gte(webmention.verifyFailStreak, WEBMENTION_HIDE_STREAK),
      ),
    )
    .returning({ id: webmention.id })
  return rows.length
}

export function findNextWebmentionReverifyDueAt(db: Database): Date | 'now' | null {
  const rows = sqliteOf(db)
    .select({ lastVerifiedAt: webmention.lastVerifiedAt })
    .from(webmention)
    .where(reverifyCycleWhere())
    .orderBy(asc(webmention.lastVerifiedAt))
    .limit(1)
    .all()
  const first = rows[0]
  if (first === undefined) {
    return null
  }
  if (first.lastVerifiedAt === null || first.lastVerifiedAt.getTime() <= Date.now() - WEBMENTION_REVERIFY_INTERVAL_MS) {
    return 'now'
  }
  return new Date(first.lastVerifiedAt.getTime() + WEBMENTION_REVERIFY_INTERVAL_MS)
}

export async function applyWebmentionReverifySuccess(
  db: Database,
  id: number,
  values: {
    title: string | null
    authorName: string | null
    summary: string | null
    type: WebmentionRow['type']
  },
): Promise<WebmentionRow | null> {
  const now = new Date()
  const rows = await sqliteOf(db)
    .update(webmention)
    .set({
      status: sql`CASE WHEN ${webmention.status} = 'hidden' THEN 'approved' ELSE ${webmention.status} END`,
      verificationStatus: 'verified',
      lastVerifiedAt: now,
      lastError: null,
      verifyFailStreak: 0,
      title: values.title,
      authorName: values.authorName,
      summary: values.summary,
      type: values.type,
      updatedAt: now,
    })
    .where(eq(webmention.id, id))
    .returning()
  return rows[0] ?? null
}

export async function applyWebmentionReverifyFailure(
  db: Database,
  id: number,
  values: { lastError: string; count: 'daily' | 'manual'; hideStreak: number },
): Promise<WebmentionRow | null> {
  const now = new Date()
  const daily = values.count === 'daily'
  const rows = await sqliteOf(db)
    .update(webmention)
    .set({
      status: daily
        ? sql`CASE WHEN ${webmention.status} IN ('approved', 'pending') AND ${webmention.verifyFailStreak} + 1 >= ${values.hideStreak} THEN 'hidden' ELSE ${webmention.status} END`
        : undefined,
      verificationStatus: 'failed',
      lastVerifiedAt: daily ? now : undefined,
      lastError: truncateVerifyError(values.lastError),
      verifyFailStreak: daily ? sql`MIN(${webmention.verifyFailStreak} + 1, ${values.hideStreak})` : undefined,
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
