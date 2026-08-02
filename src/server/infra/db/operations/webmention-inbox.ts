import { and, asc, eq, isNull, lte, or } from 'drizzle-orm'

import type { Database } from '@/server/infra/db/database'
import type { WebmentionInboxRow } from '@/server/infra/db/types'

import { webmentionInbox } from '@/server/infra/db/schema/webmention'

// Receive-side verification queue operations (mirror of
// webmention-outbox.ts). Every row is awaiting verification — success
// and terminal failure both DELETE the row, so there is no status
// column to filter on.

/**
 * Enqueue a (source, target) pair for async verification. A repeat POST
 * while the pair is already queued resets the retry bookkeeping and
 * re-arms the row for immediate processing — the sender re-asserted the
 * mention, so whatever backoff the row was sitting on no longer applies.
 */
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

/** The worker's batch: rows due for verification, earliest first. */
export async function pickDueWebmentionInbox(db: Database, now: Date, limit: number): Promise<WebmentionInboxRow[]> {
  return db
    .select()
    .from(webmentionInbox)
    .where(or(isNull(webmentionInbox.nextRetryAt), lte(webmentionInbox.nextRetryAt, now)))
    .orderBy(asc(webmentionInbox.nextRetryAt), asc(webmentionInbox.id))
    .limit(limit)
}

/** The scheduler's next wake-up: the earliest retry time among queued
 *  rows, or NULL when a row is processable right now (delay 0) / no row
 *  is queued (suspend). Sync (node:sqlite): the scheduleJob seam's
 *  `nextDelayMs` is synchronous. */
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

/** Receive switched off while rows were queued: drain them all (the
 *  endpoint already told every sender 410 — nothing here will be
 *  accepted any more). Returns the dropped count for the log line. */
export async function clearWebmentionInbox(db: Database): Promise<number> {
  const rows = await db.delete(webmentionInbox).returning({ id: webmentionInbox.id })
  return rows.length
}

/** Test/admin introspection: everything still queued. */
export async function listWebmentionInbox(db: Database): Promise<WebmentionInboxRow[]> {
  return db.select().from(webmentionInbox).orderBy(asc(webmentionInbox.id))
}

/** Pair lookup — the endpoint's idempotency assertions. */
export async function findWebmentionInboxByPair(
  db: Database,
  sourceUrl: string,
  targetUrl: string,
): Promise<WebmentionInboxRow | null> {
  const rows = await db
    .select()
    .from(webmentionInbox)
    .where(and(eq(webmentionInbox.sourceUrl, sourceUrl), eq(webmentionInbox.targetUrl, targetUrl)))
    .limit(1)
  return rows[0] ?? null
}
