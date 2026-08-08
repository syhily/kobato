import type { WebmentionReceiveInput } from '@/server/domains/webmentions/schema'
import type { Database } from '@/server/infra/db/database'

import { rescheduleWebmentionInbox } from '@/server/domains/webmentions/inbox-scheduler'
import { resolveWebmentionTargetOrThrow } from '@/server/domains/webmentions/target'
import { requireSourceKey } from '@/server/domains/webmentions/verify'
import { upsertWebmentionInbox } from '@/server/infra/db/operations/webmention-inbox'

/**
 * The receive endpoint's synchronous half (async-inbox design,
 * docs/plans/2026-08-02-webmention-async-inbox-design.md): unknown targets
 * 404 at the route; verification happens in the inbox worker.
 */
export async function enqueueWebmention(db: Database, input: WebmentionReceiveInput): Promise<void> {
  const target = await resolveWebmentionTargetOrThrow(db, input.target)
  await upsertWebmentionInbox(db, { sourceUrl: requireSourceKey(input.source), targetUrl: target.canonicalUrl })
  rescheduleWebmentionInbox()
}
