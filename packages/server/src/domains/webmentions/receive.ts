import type { Database } from '@kobato/db/database.ts'
import type { WebmentionUpsertOutcome } from '@kobato/db/operations/webmention.ts'
import type { WebmentionRow } from '@kobato/db/types.ts'
import type { WebmentionReceiveInput } from '@kobato/server/domains/webmentions/schema.ts'

import { upsertWebmention } from '@kobato/db/operations/webmention.ts'
import { classifyWebmentionType, type WebmentionType } from '@kobato/server/domains/webmentions/classify.ts'
import { sendNewWebmention } from '@kobato/server/domains/webmentions/email.ts'
import { fetchSourceHtml } from '@kobato/server/domains/webmentions/fetch.ts'
import { resolveWebmentionTargetOrThrow } from '@kobato/server/domains/webmentions/target.ts'
import {
  extractSourceMetadata,
  requireSourceKey,
  sourceLinksToTarget,
  type SourceMetadata,
} from '@kobato/server/domains/webmentions/verify.ts'
import { fireAndForgetNotify } from '@kobato/server/infra/email/admin-notification.ts'
import { DomainError } from '@kobato/server/infra/http/errors.ts'
import { getLogger } from '@kobato/server/infra/logger.ts'

const log = getLogger('webmentions.receive')

export interface ReceiveWebmentionResult {
  row: WebmentionRow
  outcome: WebmentionUpsertOutcome
}

export interface VerifiedSource {
  meta: SourceMetadata
  type: WebmentionType
}

export async function verifyWebmentionSource(sourceUrl: string, targetCanonicalUrl: string): Promise<VerifiedSource> {
  const html = await fetchSourceHtml(sourceUrl)
  if (!sourceLinksToTarget(html, sourceUrl, targetCanonicalUrl)) {
    throw new DomainError('BAD_REQUEST', 'source does not link to target')
  }
  return { meta: extractSourceMetadata(html), type: classifyWebmentionType(html, sourceUrl, targetCanonicalUrl) }
}

/**
 * Verify + store one mention as `pending` and notify: the dedupe key is the
 * normalized source from `requireSourceKey`; notification fires only on
 * `inserted`/`demoted`.
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
