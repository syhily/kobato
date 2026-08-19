import { asc, eq, isNull, lte, or } from 'drizzle-orm'

import type { Database } from '@/server/infra/db/database'
import type { WebmentionInboxRow } from '@/server/infra/db/types'

import { webmentionInbox } from '@/server/infra/db/schema/webmention'

// Receive-side verification queue (mirror of webmention-outbox.ts).
// No status column: success and terminal failure both delete the row.

/** Enqueue for async verification; a repeat POST resets the retry bookkeeping. */
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
      set: { attempts: 0, nextRetryAt: null, lastError: null, updatedAt: now },
    })
}

export async function pickDueWebmentionInbox(db: Database, now: Date, limit: number): Promise<WebmentionInboxRow[]> {
  return db
    .select()
    .from(webmentionInbox)
    .where(or(isNull(webmentionInbox.nextRetryAt), lte(webmentionInbox.nextRetryAt, now)))
    .orderBy(asc(webmentionInbox.nextRetryAt), asc(webmentionInbox.id))
    .limit(limit)
}

/** The scheduler's next wake-up: earliest retry time, `'now'` when due, null when empty.
 *  Sync (node:sqlite): scheduleJob's `nextDelayMs` is synchronous. */
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

/** Re-arm a row after a transient failure, on the backoff waterline. */
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

/** Verified or terminally failed — either way the row leaves the queue. */
export async function deleteWebmentionInbox(db: Database, id: number): Promise<void> {
  await db.delete(webmentionInbox).where(eq(webmentionInbox.id, id))
}

/** Receive switched off: drain all queued rows. Returns the dropped count. */
export async function clearWebmentionInbox(db: Database): Promise<number> {
  const rows = await db.delete(webmentionInbox).returning({ id: webmentionInbox.id })
  return rows.length
}

/** Test/admin introspection: everything still queued. */
export async function listWebmentionInbox(db: Database): Promise<WebmentionInboxRow[]> {
  return db.select().from(webmentionInbox).orderBy(asc(webmentionInbox.id))
}
