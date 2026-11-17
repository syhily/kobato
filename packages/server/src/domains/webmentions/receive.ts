import type { Database } from '../../infra/db/database'
import type { WebmentionUpsertOutcome } from '../../infra/db/operations/webmention'
import type { WebmentionRow } from '../../infra/db/types'
import type { WebmentionReceiveInput } from './schema'

import { upsertWebmention } from '../../infra/db/operations/webmention'
import { fireAndForgetNotify } from '../../infra/email/admin-notification'
import { DomainError } from '../../infra/http/errors'
import { getLogger } from '../../infra/logger'
import { classifyWebmentionType, type WebmentionType } from './classify'
import { sendNewWebmention } from './email'
import { fetchSourceHtml } from './fetch'
import { resolveWebmentionTargetOrThrow } from './target'
import { extractSourceMetadata, requireSourceKey, sourceLinksToTarget, type SourceMetadata } from './verify'

const log = getLogger('webmentions.receive')

export interface ReceiveWebmentionResult {
  row: WebmentionRow
  /** Upsert outcome driving the notification decision. */
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
