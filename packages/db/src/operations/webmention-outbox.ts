import type { Database } from '@kobato/db/database'
import type { WebmentionOutboxRow } from '@kobato/db/types'

import { webmentionOutbox } from '@kobato/db/schema/webmention'
import { and, asc, count, desc, eq, inArray, isNull, lt, lte, or } from 'drizzle-orm'

export type WebmentionOutboxStatus = WebmentionOutboxRow['status']

export type WebmentionOutboxStatusCounts = { all: number } & { [S in WebmentionOutboxStatus]: number }

export async function upsertWebmentionOutbox(
  db: Database,
  values: { sourceUrl: string; targetUrl: string; nextRetryAt?: Date | null },
): Promise<void> {
  const now = new Date()
  await db
    .insert(webmentionOutbox)
    .values({
      sourceUrl: values.sourceUrl,
      targetUrl: values.targetUrl,
      nextRetryAt: values.nextRetryAt ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [webmentionOutbox.sourceUrl, webmentionOutbox.targetUrl],
      set: { status: 'pending', attempts: 0, nextRetryAt: values.nextRetryAt ?? null, lastError: null, updatedAt: now },
      setWhere: inArray(webmentionOutbox.status, ['no-endpoint', 'failed']),
    })
  if (values.nextRetryAt !== null && values.nextRetryAt !== undefined) {
    await db
      .update(webmentionOutbox)
      .set({ nextRetryAt: values.nextRetryAt, updatedAt: now })
      .where(
        and(
          eq(webmentionOutbox.sourceUrl, values.sourceUrl),
          eq(webmentionOutbox.targetUrl, values.targetUrl),
          eq(webmentionOutbox.status, 'pending'),
          or(isNull(webmentionOutbox.nextRetryAt), lt(webmentionOutbox.nextRetryAt, values.nextRetryAt)),
        ),
      )
  }
}

/** The worker's batch: due `pending` rows — NULL waterline first, then retry time
 *  (SQLite ASC sorts NULLs first). */
export async function pickDueWebmentionOutbox(db: Database, now: Date, limit: number): Promise<WebmentionOutboxRow[]> {
  return db
    .select()
    .from(webmentionOutbox)
    .where(
      and(
        eq(webmentionOutbox.status, 'pending'),
        or(isNull(webmentionOutbox.nextRetryAt), lte(webmentionOutbox.nextRetryAt, now)),
      ),
    )
    .orderBy(asc(webmentionOutbox.nextRetryAt), asc(webmentionOutbox.id))
    .limit(limit)
}

export function findNextWebmentionOutboxDueAt(db: Database): Date | 'now' | null {
  const rows = db
    .select({ nextRetryAt: webmentionOutbox.nextRetryAt })
    .from(webmentionOutbox)
    .where(eq(webmentionOutbox.status, 'pending'))
    .orderBy(asc(webmentionOutbox.nextRetryAt))
    .limit(1)
    .all()
  const first = rows[0]
  if (first === undefined) {
    return null
  }
  return first.nextRetryAt ?? 'now'
}

export async function setWebmentionOutboxEndpoint(db: Database, id: number, endpoint: string): Promise<void> {
  await db.update(webmentionOutbox).set({ endpoint, updatedAt: new Date() }).where(eq(webmentionOutbox.id, id))
}

export async function markWebmentionOutboxSent(db: Database, id: number): Promise<void> {
  const now = new Date()
  await db
    .update(webmentionOutbox)
    .set({ status: 'sent', sentAt: now, lastError: null, updatedAt: now })
    .where(eq(webmentionOutbox.id, id))
}

export async function markWebmentionOutboxRetry(
  db: Database,
  id: number,
  attempts: number,
  nextRetryAt: Date,
  lastError: string,
): Promise<void> {
  await db
    .update(webmentionOutbox)
    .set({ attempts, nextRetryAt, lastError, updatedAt: new Date() })
    .where(eq(webmentionOutbox.id, id))
}

export async function markWebmentionOutboxTerminal(
  db: Database,
  id: number,
  status: 'no-endpoint' | 'failed',
  lastError?: string,
  attempts?: number,
): Promise<void> {
  await db
    .update(webmentionOutbox)
    .set({
      status,
      lastError: lastError ?? null,
      updatedAt: new Date(),
      ...(attempts !== undefined ? { attempts } : {}),
    })
    .where(eq(webmentionOutbox.id, id))
}

export async function listWebmentionOutboxForAdmin(
  db: Database,
  status: WebmentionOutboxStatus | undefined,
  offset: number,
  limit: number,
): Promise<WebmentionOutboxRow[]> {
  return db
    .select()
    .from(webmentionOutbox)
    .where(status === undefined ? undefined : eq(webmentionOutbox.status, status))
    .orderBy(desc(webmentionOutbox.createdAt), desc(webmentionOutbox.id))
    .offset(offset)
    .limit(limit)
}

export async function countWebmentionOutboxByStatus(db: Database): Promise<WebmentionOutboxStatusCounts> {
  const rows = await db
    .select({ status: webmentionOutbox.status, count: count() })
    .from(webmentionOutbox)
    .groupBy(webmentionOutbox.status)
  const counts: WebmentionOutboxStatusCounts = { all: 0, pending: 0, sent: 0, 'no-endpoint': 0, failed: 0 }
  for (const row of rows) {
    counts[row.status] = row.count
    counts.all += row.count
  }
  return counts
}
