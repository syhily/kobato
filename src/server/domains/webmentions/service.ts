import type { WebmentionReceiveInput } from '@/server/domains/webmentions/schema'
import type { Database } from '@/server/infra/db/database'
import type {
  WebmentionStatus,
  WebmentionStatusCounts,
  WebmentionUpsertOutcome,
} from '@/server/infra/db/operations/webmention'
import type { WebmentionOutboxStatusCounts } from '@/server/infra/db/operations/webmention-outbox'
import type { EntityTarget } from '@/server/infra/db/target'
import type { WebmentionRow } from '@/server/infra/db/types'
import type {
  AdminWebmentionOutboxWire,
  AdminWebmentionWire,
  PublicWebmentionWire,
} from '@/shared/contracts/webmentions'

import { classifyWebmentionType } from '@/server/domains/webmentions/classify'
import { sendNewWebmention } from '@/server/domains/webmentions/email'
import { fetchSourceHtml } from '@/server/domains/webmentions/fetch'
import {
  asAdminWebmentionOutboxListWire,
  asAdminWebmentionsWire,
  asPublicWebmentionsWire,
} from '@/server/domains/webmentions/projection'
import { resolveWebmentionTargetOrThrow } from '@/server/domains/webmentions/target'
import { extractSourceMetadata, requireSourceKey, sourceLinksToTarget } from '@/server/domains/webmentions/verify'
import {
  countPendingWebmentions,
  countWebmentions,
  countWebmentionsByStatus,
  listApprovedWebmentionsForTarget,
  listWebmentionsByStatus,
  setWebmentionStatus,
  upsertWebmention,
} from '@/server/infra/db/operations/webmention'
import {
  countWebmentionOutboxByStatus,
  listWebmentionOutboxForAdmin,
} from '@/server/infra/db/operations/webmention-outbox'
import { fireAndForgetNotify } from '@/server/infra/email/admin-notification'
import { DomainError } from '@/server/infra/http/errors'
import { getLogger } from '@/server/infra/logger'
import { idFromString } from '@/shared/utils/id'

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

  const html = await fetchSourceHtml(input.source)
  if (!sourceLinksToTarget(html, input.source, target.canonicalUrl)) {
    throw new DomainError('BAD_REQUEST', 'source does not link to target')
  }

  const meta = extractSourceMetadata(html)
  const type = classifyWebmentionType(html, input.source, target.canonicalUrl)
  const sourceKey = requireSourceKey(input.source)
  const { row, outcome } = await upsertWebmention(db, {
    sourceUrl: sourceKey,
    targetUrl: target.canonicalUrl,
    status: 'pending',
    type,
    targetType: target.type,
    targetOwnerId: target.ownerId,
    fetchedAt: new Date(),
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
  input: { offset: number; limit: number; status?: 'all' | 'pending' | 'approved' | 'rejected' },
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

/** Sidebar badge feed: pending mentions awaiting moderation. */
export async function countPendingWebmentionsForAdmin(db: Database): Promise<number> {
  return countPendingWebmentions(db)
}

async function moderate(db: Database, id: string, status: WebmentionStatus): Promise<void> {
  const updated = await setWebmentionStatus(db, idFromString(id), status)
  if (updated === null) {
    throw new DomainError('NOT_FOUND', 'Webmention 不存在。')
  }
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
