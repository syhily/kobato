import { and, asc, count, desc, eq, inArray, isNull, lt, lte, or } from 'drizzle-orm'

import type { Database } from '@/server/infra/db/database'
import type { WebmentionOutboxRow } from '@/server/infra/db/types'

import { webmentionOutbox } from '@/server/infra/db/schema/webmention'

export type WebmentionOutboxStatus = WebmentionOutboxRow['status']

/**
 * Enqueue dedup on UNIQUE(source_url, target_url): a fresh pair lands as
 * `pending`; an existing `no-endpoint` / `failed` row resets to `pending`
 * (attempts cleared, endpoint kept for reuse, error wiped) — a republish
 * IS the explicit retry signal. `sent` rows are never touched: replaying
 * a delivered mention would bomb the target.
 *
 * An already-`pending` row keeps its state but takes the LATER waterline
 * when the republish pushes the publish moment out (`nextRetryAt` given):
 * the source page must answer 200 before the mention fires, and firing on
 * the stale earlier waterline would burn the retry budget against a page
 * that is not live yet. The raise is one-way — an earlier reschedule
 * leaves the waterline alone (sending late is benign).
 */
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

/**
 * The worker's batch: due `pending` rows, immediately-sendable (`NULL`
 * waterline) first, then by retry time. SQLite sorts NULLs first on ASC,
 * which is exactly that order.
 */
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

/** The scheduler's next wake-up: the earliest retry time among pending
 *  rows, or NULL when a row is sendable right now (delay 0) / no row is
 *  pending (suspend). Sync (node:sqlite): the scheduleJob seam's
 *  `nextDelayMs` is synchronous. */
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

/** Non-terminal failure: bump attempts, push the waterline out, record why. */
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

/** Terminal without delivery: `no-endpoint` (never declared) or `failed`
 *  (4xx, or attempts exhausted). `attempts` rides along when the terminal
 *  state was reached BY an attempt, so the counter stays honest. */
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

export interface WebmentionOutboxStatusCounts {
  all: number
  pending: number
  sent: number
  'no-endpoint': number
  failed: number
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

/** Housekeeping for the entity delete/unpublish paths: rows belonging to
 *  a source that no longer exists are not worth retrying — but only
 *  `pending` ones; terminal rows stay, the send log survives the post. */
export async function deletePendingWebmentionOutboxBySource(db: Database, sourceUrl: string): Promise<void> {
  await db
    .delete(webmentionOutbox)
    .where(and(eq(webmentionOutbox.sourceUrl, sourceUrl), eq(webmentionOutbox.status, 'pending')))
}
