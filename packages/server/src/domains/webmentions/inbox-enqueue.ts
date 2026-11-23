import type { Database } from '@kobato/db/sqlite/database'
import type { WebmentionReceiveInput } from '@kobato/server/domains/webmentions/schema'

import {
  countQueuedWebmentionInbox,
  countQueuedWebmentionInboxBySourceHost,
  upsertWebmentionInbox,
} from '@kobato/db/sqlite/operations/engagement/webmention-inbox'
import { rescheduleWebmentionInbox } from '@kobato/server/domains/webmentions/inbox-scheduler'
import { resolveWebmentionTargetOrThrow } from '@kobato/server/domains/webmentions/target'
import { requireSourceKey } from '@kobato/server/domains/webmentions/verify'
import { descriptorFor } from '@kobato/server/infra/http/error-descriptor'
import { DomainError } from '@kobato/server/infra/http/errors'

export const INBOX_MAX_QUEUED = 5000
export const INBOX_MAX_QUEUED_PER_SOURCE_HOST = 50

export async function enqueueWebmention(db: Database, input: WebmentionReceiveInput): Promise<void> {
  const target = await resolveWebmentionTargetOrThrow(db, input.target)
  const sourceKey = requireSourceKey(input.source)
  const [queued, queuedFromHost] = [
    await countQueuedWebmentionInbox(db),
    await countQueuedWebmentionInboxBySourceHost(db, new URL(sourceKey).origin),
  ]
  if (queued >= INBOX_MAX_QUEUED || queuedFromHost >= INBOX_MAX_QUEUED_PER_SOURCE_HOST) {
    throw new DomainError('RATE_LIMITED', descriptorFor('webmentions.error.queueFull'))
  }
  await upsertWebmentionInbox(db, { sourceUrl: sourceKey, targetUrl: target.canonicalUrl })
  rescheduleWebmentionInbox()
}
