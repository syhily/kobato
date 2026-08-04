import type { Database } from '@kobato/server/infra/db/database'
import type { EntityTarget } from '@kobato/server/infra/db/target'
import type { NewWebmention, WebmentionRow } from '@kobato/server/infra/db/types'

import { webmention } from '@kobato/server/infra/db/schema/webmention'
import { isUniqueConstraintError } from '@kobato/server/infra/http/errors'
import { and, asc, count, desc, eq, isNull, lte, or, sql } from 'drizzle-orm'

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
// belongs to the moderation act, not to source re-fetches. The
// verification fields ARE here: a successful re-mention re-verifies the
// source, so the row flips back to `verified` with a fresh waterline.
function refreshSet(values: NewWebmention, now: Date) {
  return {
    fetchedAt: values.fetchedAt ?? null,
    title: values.title ?? null,
    authorName: values.authorName ?? null,
    summary: values.summary ?? null,
    type: values.type ?? 'mention',
    verificationStatus: values.verificationStatus ?? 'verified',
    lastVerifiedAt: values.lastVerifiedAt ?? null,
    lastError: values.lastError ?? null,
    verifyFailStreak: values.verifyFailStreak ?? 0,
    rawPayload: values.rawPayload,
    updatedAt: now,
  }
}

/**
 * The shared insert-with-conflict-fallback for both pair upserts: try
 * the plain INSERT; a same-key race (the SELECT above observed an empty
 * pair before another INSERT won) hits the unique index and falls back
 * to `ON CONFLICT DO UPDATE` with the caller's conflict set plus the
 * status CASE. The conflict path cannot see the old status, so it
 * reports `raced: true` — the callers map that to the non-notifying
 * `updated` outcome.
 */
async function insertWebmentionRow(
  db: Database,
  values: NewWebmention,
  conflictSet: (now: Date) => Partial<NewWebmention>,
): Promise<{ row: WebmentionRow; raced: boolean }> {
  const now = new Date()
  try {
    const rows = await db
      .insert(webmention)
      .values({ ...values, createdAt: now, updatedAt: now })
      .returning()
    return { row: rows[0]!, raced: false }
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
          ...conflictSet(now),
          status: sql`CASE WHEN ${webmention.status} = 'approved' THEN 'pending' ELSE ${webmention.status} END`,
        },
      })
      .returning()
    return { row: rows[0]!, raced: true }
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
 * `ON CONFLICT`'s `excluded.*` (new values only) cannot see; the race
 * fallback lives in `insertWebmentionRow`.
 */
export async function upsertWebmention(db: Database, values: NewWebmention): Promise<WebmentionUpsertResult> {
  const now = new Date()
  const existing = await findWebmentionByPair(db, values.sourceUrl, values.targetUrl)

  if (existing === null) {
    const { row, raced } = await insertWebmentionRow(db, values, (n) => refreshSet(values, n))
    return { row, outcome: raced ? 'updated' : 'inserted' }
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
  hidden: number
}

export async function countWebmentionsByStatus(db: Database): Promise<WebmentionStatusCounts> {
  const rows = await db
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
    .set({
      status,
      moderatedAt: now,
      // A fresh approval restarts the hide countdown: the
      // 7-consecutive-days rule counts failures of the APPROVED mention,
      // not failures accumulated while it sat pending in the daily cycle.
      verifyFailStreak: status === 'approved' ? 0 : undefined,
      updatedAt: now,
    })
    .where(eq(webmention.id, id))
    .returning()
  return rows[0] ?? null
}

// ─── Verification state (verify redesign) ─────────────────────────────
// The receive-time check and the daily re-verification cycle both write
// through the `verificationStatus` / `lastVerifiedAt` / `lastError` /
// `verifyFailStreak` columns. The daily cycle picks rows on the 24h
// waterline, so each row is re-fetched at most once per day and a missed
// run (server down) self-heals on the next wake-up.

export const WEBMENTION_REVERIFY_INTERVAL_MS = 24 * 60 * 60 * 1000
const MAX_LAST_ERROR_LENGTH = 500

export function truncateVerifyError(message: string): string {
  return message.length > MAX_LAST_ERROR_LENGTH ? `${message.slice(0, MAX_LAST_ERROR_LENGTH)}…` : message
}

/**
 * Record a terminally failed receive-time verification (the inbox
 * worker's attempt budget spent, or a non-retryable failure): the pair
 * lands as a `pending` row with `verificationStatus='failed'` and the
 * failure message — the admin sees why instead of a silent drop. An
 * existing row of the same pair is updated: `approved` demotes back to
 * `pending` (the source no longer verifies, so it leaves the public
 * page), `rejected` stays rejected, `pending` stays pending. The streak
 * stays 0 — only the DAILY cycle counts consecutive days.
 */
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
    fetchedAt: null,
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
    rawPayload: { source: values.sourceUrl, target: values.targetUrl },
    ...failureSet,
  }
  const existing = await findWebmentionByPair(db, values.sourceUrl, values.targetUrl)
  if (existing === null) {
    const { row } = await insertWebmentionRow(db, rowValues, () => failureSet)
    return row
  }
  const rows = await db
    .update(webmention)
    .set({ ...failureSet, status: existing.status === 'approved' ? 'pending' : existing.status })
    .where(eq(webmention.id, existing.id))
    .returning()
  return rows[0]!
}

/**
 * The daily re-verification cycle's pick: rows that are either displayed
 * (`approved`) or recovering from a failed receive-time check (`pending`
 * with `verificationStatus='failed'`), whose last check is older than
 * the 24h waterline. `hidden` and `rejected` rows are deliberately out —
 * `hidden` is only re-checked when the admin asks, `rejected` is a
 * deliberate human decision. Oldest-checked first so the most
 * stale-dated rows surface first.
 */
export async function pickWebmentionsDueForReverify(db: Database, now: Date, limit: number): Promise<WebmentionRow[]> {
  const cutoff = new Date(now.getTime() - WEBMENTION_REVERIFY_INTERVAL_MS)
  return db
    .select()
    .from(webmention)
    .where(
      and(
        or(
          eq(webmention.status, 'approved'),
          and(eq(webmention.status, 'pending'), eq(webmention.verificationStatus, 'failed')),
        ),
        or(isNull(webmention.lastVerifiedAt), lte(webmention.lastVerifiedAt, cutoff)),
      ),
    )
    .orderBy(asc(webmention.lastVerifiedAt), asc(webmention.id))
    .limit(limit)
}

/** The reverify scheduler's next wake-up: the earliest 24h waterline
 *  among cycle rows, `'now'` when one is already due, or null when no
 *  row qualifies. There is no nudge seam for this job — when suspended
 *  it re-evaluates on the `scheduleJob` suspended poll (30s), so an
 *  approve or a failed inbox landing is picked up without a reschedule
 *  call (promptness is irrelevant at a 24h cadence). Sync
 *  (node:sqlite), same contract as the inbox scheduler's
 *  `findNextWebmentionInboxDueAt`. */
export function findNextWebmentionReverifyDueAt(db: Database): Date | 'now' | null {
  const rows = db
    .select({ lastVerifiedAt: webmention.lastVerifiedAt })
    .from(webmention)
    .where(
      or(
        eq(webmention.status, 'approved'),
        and(eq(webmention.status, 'pending'), eq(webmention.verificationStatus, 'failed')),
      ),
    )
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

/**
 * A successful verification (daily cycle or the admin's manual
 * re-verification): the row is `verified` with a fresh waterline, the
 * failure bookkeeping resets, and the extracted metadata refreshes.
 * `restoreStatus` flips `hidden` back to `approved` — the manual
 * path only; the daily cycle never touches `hidden` rows.
 */
export async function applyWebmentionReverifySuccess(
  db: Database,
  id: number,
  values: {
    title: string | null
    authorName: string | null
    summary: string | null
    type: WebmentionRow['type']
    restoreStatus: boolean
  },
): Promise<WebmentionRow | null> {
  const now = new Date()
  const rows = await db
    .update(webmention)
    .set({
      status: values.restoreStatus ? 'approved' : undefined,
      verificationStatus: 'verified',
      lastVerifiedAt: now,
      lastError: null,
      verifyFailStreak: 0,
      fetchedAt: now,
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

/**
 * A failed verification. Two counting modes, owned by the caller:
 * - `count: 'daily'` (the daily cycle) — the streak increment and the
 *   hide decision are folded into ONE atomic UPDATE: the CASE reads the
 *   row's CURRENT streak and status at write time, so a concurrent
 *   manual re-verification that reset the streak cannot be overwritten
 *   by a stale pre-fetch computation (the domain passes no pre-read
 *   values). `status='approved'` with `streak + 1 >= hideStreak` flips
 *   the row to `hidden`; the streak is capped at `hideStreak` so a
 *   pending row whose target vanished cannot accumulate an unbounded
 *   counter. The waterline moves (`lastVerifiedAt = now`).
 * - `count: 'manual'` (the admin's manual re-verification) — records
 *   only the failure message: no streak bump, no hide, and the 24h
 *   waterline is untouched (an admin's failed attempt must not delay
 *   the next daily check).
 */
export async function applyWebmentionReverifyFailure(
  db: Database,
  id: number,
  values: { lastError: string; count: 'daily' | 'manual'; hideStreak: number },
): Promise<WebmentionRow | null> {
  const now = new Date()
  const daily = values.count === 'daily'
  const rows = await db
    .update(webmention)
    .set({
      status: daily
        ? sql`CASE WHEN ${webmention.status} = 'approved' AND ${webmention.verifyFailStreak} + 1 >= ${values.hideStreak} THEN 'hidden' ELSE ${webmention.status} END`
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
