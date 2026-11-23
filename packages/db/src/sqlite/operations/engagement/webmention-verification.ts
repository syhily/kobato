import type { Database } from '@kobato/db/sqlite/database'
import type { NewWebmention, WebmentionRow } from '@kobato/db/sqlite/types'

import { sqliteOf } from '@kobato/db/sqlite/database'
import { findWebmentionByPair, insertWebmentionRow } from '@kobato/db/sqlite/operations/engagement/webmention'
import { webmention } from '@kobato/db/sqlite/schema/webmention'
import { and, asc, eq, gte, isNull, lt, lte, or, sql } from 'drizzle-orm'

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
