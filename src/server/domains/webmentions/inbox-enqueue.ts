import type { WebmentionReceiveInput } from '@/server/domains/webmentions/schema'
import type { Database } from '@/server/infra/db/database'

import { rescheduleWebmentionInbox } from '@/server/domains/webmentions/inbox-scheduler'
import { resolveWebmentionTargetOrThrow } from '@/server/domains/webmentions/target'
import { requireSourceKey } from '@/server/domains/webmentions/verify'
import {
  countQueuedWebmentionInbox,
  countQueuedWebmentionInboxBySourceHost,
  upsertWebmentionInbox,
} from '@/server/infra/db/operations/webmention-inbox'
import { descriptorFor } from '@/server/infra/http/error-descriptor'
import { DomainError } from '@/server/infra/http/errors'

// The receive endpoint is unauthenticated by design, so the queue itself
// must be bounded: a global depth cap plus a per-source-host fan-out cap.
// Without them a flood of unique `?x=N` source variants grows the table
// without limit and starves legitimate mentions behind hostile rows.
export const INBOX_MAX_QUEUED = 5000
export const INBOX_MAX_QUEUED_PER_SOURCE_HOST = 50

/**
 * The receive endpoint's synchronous half (async-inbox design,
 * docs/plans/2026-08-02-webmention-async-inbox-design.md): unknown targets
 * 404 at the route; verification happens in the inbox worker. A full queue
 * backpressures with RATE_LIMITED (429) instead of absorbing unboundedly.
 */
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
