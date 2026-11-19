import type { Database } from '@kobato/db/database.ts'
import type { WebmentionInboxRow } from '@kobato/db/types.ts'

import { escapeLikePattern } from '@kobato/db/like-escape.ts'
import { webmentionInbox } from '@kobato/db/schema/webmention.ts'
import { asc, count, eq, gt, isNull, lte, or, sql } from 'drizzle-orm'

export async function upsertWebmentionInbox(
  db: Database,
  values: { sourceUrl: string; targetUrl: string },
): Promise<void> {
  const now = new Date()
  await db
    .insert(webmentionInbox)
    .values({
      sourceUrl: values.sourceUrl,
      targetUrl: values.targetUrl,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [webmentionInbox.sourceUrl, webmentionInbox.targetUrl],
      set: { updatedAt: now },
    })
}

export async function countQueuedWebmentionInbox(db: Database): Promise<number> {
  const rows = await db.select({ value: count() }).from(webmentionInbox)
  return rows[0]?.value ?? 0
}

export async function countQueuedWebmentionInboxBySourceHost(db: Database, origin: string): Promise<number> {
  const rows = await db
    .select({ value: count() })
    .from(webmentionInbox)
    .where(sql`${webmentionInbox.sourceUrl} LIKE ${`${escapeLikePattern(origin)}/%`} ESCAPE '\\'`)
  return rows[0]?.value ?? 0
}

export async function pickDueWebmentionInbox(db: Database, now: Date, limit: number): Promise<WebmentionInboxRow[]> {
  return db
    .select()
    .from(webmentionInbox)
    .where(or(isNull(webmentionInbox.nextRetryAt), lte(webmentionInbox.nextRetryAt, now)))
    .orderBy(asc(webmentionInbox.nextRetryAt), asc(webmentionInbox.id))
    .limit(limit)
}

export function findNextWebmentionInboxDueAt(db: Database): Date | 'now' | null {
  const rows = db
    .select({ nextRetryAt: webmentionInbox.nextRetryAt })
    .from(webmentionInbox)
    .orderBy(asc(webmentionInbox.nextRetryAt))
    .limit(1)
    .all()
  const first = rows[0]
  if (first === undefined) {
    return null
  }
  return first.nextRetryAt ?? 'now'
}

export async function markWebmentionInboxRetry(
  db: Database,
  id: number,
  attempts: number,
  nextRetryAt: Date,
  error: string,
): Promise<void> {
  await db
    .update(webmentionInbox)
    .set({ attempts, nextRetryAt, lastError: error, updatedAt: new Date() })
    .where(eq(webmentionInbox.id, id))
}

export async function deleteWebmentionInbox(db: Database, id: number): Promise<void> {
  await db.delete(webmentionInbox).where(eq(webmentionInbox.id, id))
}

export async function clearWebmentionInbox(db: Database): Promise<number> {
  const rows = await db.delete(webmentionInbox).returning({ id: webmentionInbox.id })
  return rows.length
}

export async function listWebmentionInbox(db: Database): Promise<WebmentionInboxRow[]> {
  return db.select().from(webmentionInbox).orderBy(asc(webmentionInbox.id))
}

export async function countWebmentionInbox(db: Database): Promise<{ depth: number; attention: number }> {
  const depthRows = await db.select({ value: count() }).from(webmentionInbox)
  const attentionRows = await db.select({ value: count() }).from(webmentionInbox).where(gt(webmentionInbox.attempts, 0))
  return { depth: depthRows[0]?.value ?? 0, attention: attentionRows[0]?.value ?? 0 }
}
