import type { WebmentionReceiveInput } from '@/server/domains/webmentions/schema'
import type { Database } from '@/server/infra/db/database'
import type { WebmentionStatus, WebmentionStatusCounts } from '@/server/infra/db/operations/webmention'
import type { WebmentionOutboxStatusCounts } from '@/server/infra/db/operations/webmention-outbox'
import type { WebmentionRow } from '@/server/infra/db/types'
import type { AdminWebmentionOutboxWire, AdminWebmentionWire } from '@/shared/contracts/webmentions'

import { sendNewWebmention } from '@/server/domains/webmentions/email'
import { fetchSourceHtml } from '@/server/domains/webmentions/fetch'
import { asAdminWebmentionOutboxListWire, asAdminWebmentionsWire } from '@/server/domains/webmentions/projection'
import { resolveWebmentionTarget } from '@/server/domains/webmentions/target'
import { extractSourceMetadata, sourceLinksToTarget } from '@/server/domains/webmentions/verify'
import {
  countWebmentions,
  countWebmentionsByStatus,
  insertWebmention,
  listWebmentionsByStatus,
  setWebmentionStatus,
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

/**
 * Receive a webmention: resolve the target to a live post/page, fetch
 * the source through the SSRF-guarded fetcher, verify it links to the
 * target's canonical URL, then store it as `pending` and notify the
 * admin. Verification is synchronous by design (plan 026 Phase 0 #3) —
 * the 202 only goes out once the mention is verified and durable.
 */
export async function receiveWebmention(db: Database, input: WebmentionReceiveInput): Promise<WebmentionRow> {
  const target = await resolveWebmentionTarget(db, input.target)
  if (target === null) {
    throw new DomainError('NOT_FOUND', 'target is not a resource on this site')
  }

  const html = await fetchSourceHtml(input.source)
  if (!sourceLinksToTarget(html, input.source, target.canonicalUrl)) {
    throw new DomainError('BAD_REQUEST', 'source does not link to target')
  }

  const meta = extractSourceMetadata(html)
  const row = await insertWebmention(db, {
    sourceUrl: input.source,
    targetUrl: target.canonicalUrl,
    status: 'pending',
    targetType: target.type,
    targetOwnerId: target.ownerId,
    fetchedAt: new Date(),
    authorName: meta.authorName,
    title: meta.title,
    summary: meta.summary,
    rawPayload: { source: input.source, target: input.target },
  })

  fireAndForgetNotify(sendNewWebmention(row, target), log, 'new webmention')
  return row
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
