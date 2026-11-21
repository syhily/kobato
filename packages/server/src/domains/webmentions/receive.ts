import type { Database } from '@kobato/db/database'
import type { WebmentionUpsertOutcome } from '@kobato/db/operations/webmention'
import type { WebmentionRow } from '@kobato/db/types'
import type { WebmentionReceiveInput } from '@kobato/server/domains/webmentions/schema'

import { upsertWebmention } from '@kobato/db/operations/webmention'
import { classifyWebmentionType, type WebmentionType } from '@kobato/server/domains/webmentions/classify'
import { sendNewWebmention } from '@kobato/server/domains/webmentions/email'
import { fetchSourceHtml } from '@kobato/server/domains/webmentions/fetch'
import { resolveWebmentionTargetOrThrow } from '@kobato/server/domains/webmentions/target'
import {
  extractSourceMetadata,
  requireSourceKey,
  sourceLinksToTarget,
  type SourceMetadata,
} from '@kobato/server/domains/webmentions/verify'
import { fireAndForgetNotify } from '@kobato/server/infra/email/admin-notification'
import { DomainError } from '@kobato/server/infra/http/errors'
import { getLogger } from '@kobato/server/infra/logger'

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
