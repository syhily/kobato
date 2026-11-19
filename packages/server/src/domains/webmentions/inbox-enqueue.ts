import type { Database } from '@kobato/db/database.ts'
import type { WebmentionReceiveInput } from '@kobato/server/domains/webmentions/schema.ts'

import {
  countQueuedWebmentionInbox,
  countQueuedWebmentionInboxBySourceHost,
  upsertWebmentionInbox,
} from '@kobato/db/operations/webmention-inbox.ts'
import { rescheduleWebmentionInbox } from '@kobato/server/domains/webmentions/inbox-scheduler.ts'
import { resolveWebmentionTargetOrThrow } from '@kobato/server/domains/webmentions/target.ts'
import { requireSourceKey } from '@kobato/server/domains/webmentions/verify.ts'
import { descriptorFor } from '@kobato/server/infra/http/error-descriptor.ts'
import { DomainError } from '@kobato/server/infra/http/errors.ts'

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
