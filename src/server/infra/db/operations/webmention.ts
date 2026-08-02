import { and, asc, count, desc, eq, sql } from 'drizzle-orm'

import type { Database } from '@/server/infra/db/database'
import type { EntityTarget } from '@/server/infra/db/target'
import type { NewWebmention, WebmentionRow } from '@/server/infra/db/types'

import { webmention } from '@/server/infra/db/schema/webmention'
import { isUniqueConstraintError } from '@/server/infra/http/errors'

export type WebmentionStatus = WebmentionRow['status']

/**
 * Re-mention upsert outcome (plan: webmention v3 R13/R15):
 * - `inserted` — a brand-new (source, target) pair landed;
 * - `updated` — an existing `pending` / `rejected` row refreshed its
 *   extracted metadata (no moderation event, no notification);
 * - `demoted` — an `approved` row's source changed, so it dropped back
 *   to `pending` for re-review (an admin-action event → notify).
 */
export type WebmentionUpsertOutcome = 'inserted' | 'updated' | 'demoted'

export interface WebmentionUpsertResult {
  row: WebmentionRow
  outcome: WebmentionUpsertOutcome
}

async function findWebmentionByPair(db: Database, sourceUrl: string, targetUrl: string): Promise<WebmentionRow | null> {
  const rows = await db
    .select()
    .from(webmention)
    .where(and(eq(webmention.sourceUrl, sourceUrl), eq(webmention.targetUrl, targetUrl)))
    .limit(1)
  return rows[0] ?? null
}

// Fields a re-mention refreshes. `status` and `moderatedAt` are NOT here:
// status follows the current row's moderation state (see the CASE in the
// conflict fallback / the caller's demote decision), and moderatedAt
// belongs to the moderation act, not to source re-fetches.
function refreshSet(values: NewWebmention, now: Date) {
  return {
    fetchedAt: values.fetchedAt ?? null,
    title: values.title ?? null,
    authorName: values.authorName ?? null,
    summary: values.summary ?? null,
    type: values.type ?? 'mention',
    rawPayload: values.rawPayload,
    updatedAt: now,
  }
}

/**
 * Insert a verified mention, or fold a re-mention of the same
 * (source_url, target_url) pair into the existing row (IndieWeb
 * update-not-duplicate semantics on UNIQUE(source_url, target_url)):
 * - `pending` → stays pending with refreshed metadata;
 * - `approved` → demotes to `pending` for re-review (the mention leaves
 *   the public page until re-approved);
 * - `rejected` → stays rejected (a spammer must not edit their way
 *   around moderation).
 * Read-then-write: the demote decision needs the OLD status, which
 * `ON CONFLICT`'s `excluded.*` (new values only) cannot see. A same-key
 * race between the SELECT and the INSERT is caught by the unique index
 * and falls back to `ON CONFLICT DO UPDATE` — that path cannot know the
 * old status either, so it reports `updated` (no notification) while
 * still applying the same status CASE to the row itself.
 */
export async function upsertWebmention(db: Database, values: NewWebmention): Promise<WebmentionUpsertResult> {
  const now = new Date()
  const existing = await findWebmentionByPair(db, values.sourceUrl, values.targetUrl)

  if (existing === null) {
    try {
      const rows = await db
        .insert(webmention)
        .values({ ...values, createdAt: now, updatedAt: now })
        .returning()
      return { row: rows[0], outcome: 'inserted' }
    } catch (err) {
      if (!isUniqueConstraintError(err)) {
        throw err
      }
      const rows = await db
        .insert(webmention)
        .values({ ...values, createdAt: now, updatedAt: now })
        .onConflictDoUpdate({
          target: [webmention.sourceUrl, webmention.targetUrl],
          set: {
            ...refreshSet(values, now),
            status: sql`CASE WHEN ${webmention.status} = 'approved' THEN 'pending' ELSE ${webmention.status} END`,
          },
        })
        .returning()
      return { row: rows[0], outcome: 'updated' }
    }
  }

  const demoted = existing.status === 'approved'
  const rows = await db
    .update(webmention)
    .set({ ...refreshSet(values, now), status: demoted ? 'pending' : existing.status })
    .where(eq(webmention.id, existing.id))
    .returning()
  return { row: rows[0], outcome: demoted ? 'demoted' : 'updated' }
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

/** Sidebar badge feed: pending mentions awaiting moderation. */
export async function countPendingWebmentions(db: Database): Promise<number> {
  return countWebmentions(db, 'pending')
}

/**
 * Public display: approved mentions of one entity, oldest first. The
 * status filter + 50-row sort ride on `idx_webmention_target`
 * (target_type, target_owner_id) — no dedicated index at personal-blog
 * volume.
 */
export async function listApprovedWebmentionsForTarget(
  db: Database,
  target: EntityTarget,
  limit = 50,
): Promise<WebmentionRow[]> {
  return db
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
  const rows = await db
    .update(webmention)
    .set({ status, moderatedAt: now, updatedAt: now })
    .where(eq(webmention.id, id))
    .returning()
  return rows[0] ?? null
}
