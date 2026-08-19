import { eq } from 'drizzle-orm'

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

import { classifyWebmentionType, type WebmentionType } from '@/server/domains/webmentions/classify'
import { sendNewWebmention } from '@/server/domains/webmentions/email'
import { fetchSourceHtml } from '@/server/domains/webmentions/fetch'
import {
  asAdminWebmentionOutboxListWire,
  asAdminWebmentionsWire,
  asPublicWebmentionsWire,
} from '@/server/domains/webmentions/projection'
import { resolveWebmentionTargetOrThrow } from '@/server/domains/webmentions/target'
import {
  extractSourceMetadata,
  requireSourceKey,
  sourceLinksToTarget,
  type SourceMetadata,
} from '@/server/domains/webmentions/verify'
import {
  countPendingWebmentions,
  countWebmentions,
  countWebmentionsByStatus,
  findWebmentionById,
  listApprovedWebmentionsForTarget,
  listWebmentionsByStatus,
  setWebmentionStatus,
  upsertWebmention,
} from '@/server/infra/db/operations/webmention'
import {
  countWebmentionOutboxByStatus,
  listWebmentionOutboxForAdmin,
} from '@/server/infra/db/operations/webmention-outbox'
import { page } from '@/server/infra/db/schema/page'
import { post } from '@/server/infra/db/schema/post'
import { fireAndForgetNotify } from '@/server/infra/email/admin-notification'
import { DomainError } from '@/server/infra/http/errors'
import { getLogger } from '@/server/infra/logger'
import { requireBlogSettingsSection } from '@/shared/config/getters'
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

export interface VerifiedSource {
  meta: SourceMetadata
  type: WebmentionType
}

/**
 * The shared verification core: fetch the source (SSRF-guarded, 1 MB cap),
 * confirm the link, classify. Throws DomainError so callers share `lastError` wording.
 */
export async function verifyWebmentionSource(sourceUrl: string, targetCanonicalUrl: string): Promise<VerifiedSource> {
  const html = await fetchSourceHtml(sourceUrl)
  if (!sourceLinksToTarget(html, sourceUrl, targetCanonicalUrl)) {
    throw new DomainError('BAD_REQUEST', 'source does not link to target')
  }
  return { meta: extractSourceMetadata(html), type: classifyWebmentionType(html, sourceUrl, targetCanonicalUrl) }
}

/**
 * Verify + store one mention as `pending` and notify (async-inbox design,
 * docs/plans/2026-08-02-webmention-async-inbox-design.md): source key is
 * `requireSourceKey` (R12), notify only on `inserted`/`demoted` (R11).
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
    verificationStatus: 'verified',
    lastVerifiedAt: new Date(),
    lastError: null,
    verifyFailStreak: 0,
    authorName: meta.authorName,
    title: meta.title,
    summary: meta.summary,
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

// Outbound send log — read-only: a retry is a republish, not an admin mutation.
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

/** Public display feed — approved mentions only (DTO contract in shared/contracts). */
export async function listPublicWebmentions(db: Database, target: EntityTarget): Promise<PublicWebmentionWire[]> {
  return asPublicWebmentionsWire(await listApprovedWebmentionsForTarget(db, target))
}

/** Per-entity display switch: one PK read; a missing row answers false.
 *  Single gate shared by the detail loader and `public.webmention.list`. */
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

/** Public feed with both switches applied (global + per-entity), each to an
 *  honest empty list; single gate for SSR and the headless API. */
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
  // A hidden mention returns to the public page only via successful re-verification.
  if (status === 'approved' && row.status === 'hidden') {
    throw new DomainError('BAD_REQUEST', '已隐藏的 Webmention 只能通过重新验证恢复。')
  }
  await setWebmentionStatus(db, row.id, status)
}

// Idempotent transitions, so a double-click never errors.
export async function approveWebmention(db: Database, id: string): Promise<void> {
  await moderate(db, id, 'approved')
}

export async function rejectWebmention(db: Database, id: string): Promise<void> {
  await moderate(db, id, 'rejected')
}
