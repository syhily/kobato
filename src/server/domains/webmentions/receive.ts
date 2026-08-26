import type { WebmentionReceiveInput } from '@/server/domains/webmentions/schema'
import type { Database } from '@/server/infra/db/database'
import type { WebmentionUpsertOutcome } from '@/server/infra/db/operations/webmention'
import type { WebmentionRow } from '@/server/infra/db/types'

import { classifyWebmentionType, type WebmentionType } from '@/server/domains/webmentions/classify'
import { sendNewWebmention } from '@/server/domains/webmentions/email'
import { fetchSourceHtml } from '@/server/domains/webmentions/fetch'
import { resolveWebmentionTargetOrThrow } from '@/server/domains/webmentions/target'
import {
  extractSourceMetadata,
  requireSourceKey,
  sourceLinksToTarget,
  type SourceMetadata,
} from '@/server/domains/webmentions/verify'
import { upsertWebmention } from '@/server/infra/db/operations/webmention'
import { fireAndForgetNotify } from '@/server/infra/email/admin-notification'
import { DomainError } from '@/server/infra/http/errors'
import { getLogger } from '@/server/infra/logger'

const log = getLogger('webmentions.receive')

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
