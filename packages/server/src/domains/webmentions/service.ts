import type { WebmentionReceiveInput } from '@kobato/server/domains/webmentions/schema'
import type { Database } from '@kobato/server/infra/db/database'
import type {
  WebmentionStatus,
  WebmentionStatusCounts,
  WebmentionUpsertOutcome,
} from '@kobato/server/infra/db/operations/webmention'
import type { WebmentionOutboxStatusCounts } from '@kobato/server/infra/db/operations/webmention-outbox'
import type { EntityTarget } from '@kobato/server/infra/db/target'
import type { WebmentionRow } from '@kobato/server/infra/db/types'
import type {
  AdminWebmentionOutboxWire,
  AdminWebmentionWire,
  PublicWebmentionWire,
} from '@kobato/shared/contracts/webmentions'

import { classifyWebmentionType, type WebmentionType } from '@kobato/server/domains/webmentions/classify'
import { sendNewWebmention } from '@kobato/server/domains/webmentions/email'
import { fetchSourceHtml } from '@kobato/server/domains/webmentions/fetch'
import {
  asAdminWebmentionOutboxListWire,
  asAdminWebmentionsWire,
  asPublicWebmentionsWire,
} from '@kobato/server/domains/webmentions/projection'
import { resolveWebmentionTargetOrThrow } from '@kobato/server/domains/webmentions/target'
import {
  extractSourceMetadata,
  requireSourceKey,
  sourceLinksToTarget,
  type SourceMetadata,
} from '@kobato/server/domains/webmentions/verify'
import {
  countPendingWebmentions,
  countWebmentions,
  countWebmentionsByStatus,
  findWebmentionById,
  listApprovedWebmentionsForTarget,
  listWebmentionsByStatus,
  setWebmentionStatus,
  upsertWebmention,
} from '@kobato/server/infra/db/operations/webmention'
import {
  countWebmentionOutboxByStatus,
  listWebmentionOutboxForAdmin,
} from '@kobato/server/infra/db/operations/webmention-outbox'
import { page } from '@kobato/server/infra/db/schema/page'
import { post } from '@kobato/server/infra/db/schema/post'
import { fireAndForgetNotify } from '@kobato/server/infra/email/admin-notification'
import { DomainError } from '@kobato/server/infra/http/errors'
import { getLogger } from '@kobato/server/infra/logger'
import { requireBlogSettingsSection } from '@kobato/shared/config/getters'
import { idFromString } from '@kobato/shared/utils/id'
import { eq } from 'drizzle-orm'

const log = getLogger('webmentions.service')

export interface AdminWebmentionList {
  mentions: AdminWebmentionWire[]
  total: number
  hasMore: boolean
  statusCounts: WebmentionStatusCounts
}

export interface AdminWebmentionOutboxList {
  rows: AdminWebmentionOutboxWire[]
  total: number
  hasMore: boolean
  statusCounts: WebmentionOutboxStatusCounts
}

export interface ReceiveWebmentionResult {
  row: WebmentionRow
  /** Upsert outcome driving the notification decision (R11/R13). */
  outcome: WebmentionUpsertOutcome
}

export interface VerifiedSource {
  meta: SourceMetadata
  type: WebmentionType
}

/**
 * The shared verification core for every webmention check — the
 * receive-time check, the daily re-verification cycle, and the admin's
 * manual re-verification: fetch the source document (SSRF-guarded,
 * 1 MB cap), confirm it links to the target's canonical URL, and
 * extract the response-type classification + metadata. Throws a
 * DomainError with a human-readable message on any failure, so every
 * caller records the same `lastError` wording.
 */
export async function verifyWebmentionSource(sourceUrl: string, targetCanonicalUrl: string): Promise<VerifiedSource> {
  const html = await fetchSourceHtml(sourceUrl)
  if (!sourceLinksToTarget(html, sourceUrl, targetCanonicalUrl)) {
    throw new DomainError('BAD_REQUEST', 'source does not link to target')
  }
  return { meta: extractSourceMetadata(html), type: classifyWebmentionType(html, sourceUrl, targetCanonicalUrl) }
}

/**
 * Verify and store one webmention: resolve the target to a live
 * post/page, fetch the source through the SSRF-guarded fetcher, verify
 * it links to the target's canonical URL, classify the response type,
 * then store it as `pending` and notify the admin. The caller is the
 * inbox queue worker (`inbox.ts`) — the endpoint only enqueues the pair
 * and answers 202, so transient fetch failures surface here as
 * `DomainError` with `retryable` and terminal ones without (async-inbox
 * design, docs/plans/2026-08-02-webmention-async-inbox-design.md).
 *
 * The stored source key is `requireSourceKey(input.source)` (R12) so a
 * re-mention after the source author edits their post folds into the
 * existing row instead of duplicating. The inbox row carries only that
 * normalized key, so this worker fetches and verifies the NORMALIZED
 * source — fragment / default-port / trailing-slash variants of the
 * claimed URL converge before verification (design doc §2.1; the
 * fragment never reaches the wire anyway, and a default port is the
 * same server). Notification fires only for genuinely new
 * moderation events (R11): a fresh row (`inserted`) or an approved row
 * demoted back to pending by a content update (`demoted`) — pending
 * refreshes and rejected re-sends stay silent so a spammer cannot mail-
 * bomb the admin through one row.
 */
export async function receiveWebmention(db: Database, input: WebmentionReceiveInput): Promise<ReceiveWebmentionResult> {
  const target = await resolveWebmentionTargetOrThrow(db, input.target)

  const { meta, type } = await verifyWebmentionSource(input.source, target.canonicalUrl)
  const sourceKey = requireSourceKey(input.source)
  const { row, outcome } = await upsertWebmention(db, {
    sourceUrl: sourceKey,
    targetUrl: target.canonicalUrl,
    status: 'pending',
    type,
    targetType: target.type,
    targetOwnerId: target.ownerId,
    fetchedAt: new Date(),
    verificationStatus: 'verified',
    lastVerifiedAt: new Date(),
    lastError: null,
    verifyFailStreak: 0,
    authorName: meta.authorName,
    title: meta.title,
    summary: meta.summary,
    rawPayload: { source: input.source, target: input.target },
  })

  if (outcome !== 'updated') {
    fireAndForgetNotify(sendNewWebmention(row, target, { updated: outcome === 'demoted' }), log, 'new webmention')
  }
  return { row, outcome }
}

export async function listAdminWebmentions(
  db: Database,
  input: { offset: number; limit: number; status?: 'all' | 'pending' | 'approved' | 'rejected' | 'hidden' },
): Promise<AdminWebmentionList> {
  const status = input.status === undefined || input.status === 'all' ? undefined : input.status
  const [rows, total, statusCounts] = await Promise.all([
    listWebmentionsByStatus(db, status, input.offset, input.limit),
    countWebmentions(db, status),
    countWebmentionsByStatus(db),
  ])
  return {
    mentions: asAdminWebmentionsWire(rows),
    total,
    hasMore: input.offset + rows.length < total,
    statusCounts,
  }
}

// Outbound send log — read-only by design: a retry is a republish (the
// upsert resets terminal rows), not an admin mutation.
export async function listAdminWebmentionOutbox(
  db: Database,
  input: { offset: number; limit: number; status?: 'all' | 'pending' | 'sent' | 'no-endpoint' | 'failed' },
): Promise<AdminWebmentionOutboxList> {
  const status = input.status === undefined || input.status === 'all' ? undefined : input.status
  const [rows, statusCounts] = await Promise.all([
    listWebmentionOutboxForAdmin(db, status, input.offset, input.limit),
    countWebmentionOutboxByStatus(db),
  ])
  const total = status === undefined ? statusCounts.all : statusCounts[status]
  return {
    rows: asAdminWebmentionOutboxListWire(rows),
    total,
    hasMore: input.offset + rows.length < total,
    statusCounts,
  }
}

/** Public display feed: approved mentions only — internal fields never
 *  leave the server (see the DTO contract in shared/contracts). */
export async function listPublicWebmentions(db: Database, target: EntityTarget): Promise<PublicWebmentionWire[]> {
  return asPublicWebmentionsWire(await listApprovedWebmentionsForTarget(db, target))
}

/** The per-entity display switch (post/page meta `webmentions_enabled`).
 *  One PK read; a missing row answers false (block hidden) — safe
 *  default for a dangling target. Owned here so the detail loader and
 *  the `public.webmention.list` procedure share the same gate. */
async function isEntityWebmentionsEnabled(db: Database, target: EntityTarget): Promise<boolean> {
  if (target.type === 'post') {
    const rows = await db
      .select({ enabled: post.webmentionsEnabled })
      .from(post)
      .where(eq(post.id, target.ownerId))
      .limit(1)
    return rows[0]?.enabled ?? false
  }
  const rows = await db
    .select({ enabled: page.webmentionsEnabled })
    .from(page)
    .where(eq(page.id, target.ownerId))
    .limit(1)
  return rows[0]?.enabled ?? false
}

/**
 * The public display feed with BOTH display switches applied — the
 * global `displayOnPosts` setting AND the per-entity meta toggle — each
 * resolving to an honest empty list so the block never renders. The
 * entity flag is only read when the global switch is on. Single owner
 * of the gate: the detail loader (SSR) and the `public.webmention.list`
 * procedure (headless API) both call here, so the split never has to
 * duplicate the logic in the public frontend.
 */
export async function loadPublicWebmentionsForTarget(
  db: Database,
  target: EntityTarget,
): Promise<PublicWebmentionWire[]> {
  if (!requireBlogSettingsSection('webmentions').webmention.displayOnPosts) {
    return []
  }
  if (!(await isEntityWebmentionsEnabled(db, target))) {
    return []
  }
  return listPublicWebmentions(db, target)
}

/** Sidebar badge feed: pending mentions awaiting moderation. */
export async function countPendingWebmentionsForAdmin(db: Database): Promise<number> {
  return countPendingWebmentions(db)
}

async function moderate(db: Database, id: string, status: WebmentionStatus): Promise<void> {
  const row = await findWebmentionById(db, idFromString(id))
  if (row === null) {
    throw new DomainError('NOT_FOUND', 'Webmention 不存在。')
  }
  // A hidden mention can only return to the public page through a
  // successful re-verification — approving it directly would bypass the
  // source check that put it there.
  if (status === 'approved' && row.status === 'hidden') {
    throw new DomainError('BAD_REQUEST', '已隐藏的 Webmention 只能通过重新验证恢复。')
  }
  await setWebmentionStatus(db, row.id, status)
}

// Approve/reject are idempotent transitions (re-applying the same
// status just bumps moderatedAt) so a double-click in the admin UI
// never surfaces an error.
export async function approveWebmention(db: Database, id: string): Promise<void> {
  await moderate(db, id, 'approved')
}

export async function rejectWebmention(db: Database, id: string): Promise<void> {
  await moderate(db, id, 'rejected')
}
