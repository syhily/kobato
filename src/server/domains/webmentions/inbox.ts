import type { Database } from '@/server/infra/db/database'
import type { WebmentionInboxRow } from '@/server/infra/db/types'

import { receiveWebmention } from '@/server/domains/webmentions/service'
import { resolveWebmentionTarget } from '@/server/domains/webmentions/target'
import { upsertWebmentionVerificationFailure } from '@/server/infra/db/operations/webmention'
import {
  clearWebmentionInbox,
  deleteWebmentionInbox,
  markWebmentionInboxRetry,
  pickDueWebmentionInbox,
} from '@/server/infra/db/operations/webmention-inbox'
import { DomainError } from '@/server/infra/http/errors'
import { getLogger } from '@/server/infra/logger'
import { getBlogSettingsBundleSync, isWebmentionReceiveEnabled } from '@/shared/config/getters'

const log = getLogger('webmentions.inbox')

// Sequential single-worker verification loop, mirroring the outbound
// outbox discipline: a small batch per wake-up and at least
// INBOX_MIN_DELAY_MS between batches, so a mention burst cannot hammer
// third-party source hosts back-to-back.
export const INBOX_BATCH_SIZE = 5
export const INBOX_MAX_ATTEMPTS = 3

/** min(2^attempts × 60s, 12h), attempts already incremented: the first
 *  failure waits 2m, the second 4m — a source that is briefly
 *  unreachable (deploy, DNS flip) recovers in minutes, and the sender
 *  can always re-POST for a fresh row. */
export function inboxBackoffMs(attempts: number): number {
  return Math.min(2 ** attempts * 60_000, 12 * 3_600_000)
}

function failureMessage(error: string): string {
  return error.length > 200 ? `${error.slice(0, 200)}…` : error
}

/**
 * Verify one queued pair through the same `receiveWebmention` path the
 * synchronous endpoint used (target re-resolution included — a target
 * deleted since enqueue is a terminal NOT_FOUND, not a retry). Success
 * deletes the row; a transient fetch failure (DomainError with
 * `retryable`, or an unexpected throw) backs off until the attempt
 * budget runs out; anything terminal lands as a VISIBLE failure: the
 * pair is recorded as a `pending` row with `verificationStatus='failed'`
 * and the last failure message, so the admin sees why the mention was
 * not accepted (a vanished target is the one exception — there is no
 * page left to anchor the mention to, so it drops silently).
 */
export async function processWebmentionInboxRow(db: Database, row: WebmentionInboxRow): Promise<void> {
  try {
    await receiveWebmention(db, { source: row.sourceUrl, target: row.targetUrl })
    await deleteWebmentionInbox(db, row.id)
    return
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    // Non-DomainError throws (a hook bug, a DB hiccup) are treated as
    // transient: dropping a verified-so-far mention on an internal
    // hiccup would lose it silently.
    const retryable = !(error instanceof DomainError) || error.retryable === true
    const attempts = row.attempts + 1
    if (retryable && attempts < INBOX_MAX_ATTEMPTS) {
      await markWebmentionInboxRetry(
        db,
        row.id,
        attempts,
        new Date(Date.now() + inboxBackoffMs(attempts)),
        failureMessage(message),
      )
      return
    }
    const target = await resolveWebmentionTarget(db, row.targetUrl)
    if (target !== null) {
      await upsertWebmentionVerificationFailure(db, {
        sourceUrl: row.sourceUrl,
        targetUrl: row.targetUrl,
        targetType: target.type,
        targetOwnerId: target.ownerId,
        error: message,
      })
    }
    await deleteWebmentionInbox(db, row.id)
    log.warn('Webmention inbox row verification failed', {
      id: row.id,
      sourceUrl: row.sourceUrl,
      attempts,
      error: message,
      recorded: target !== null,
    })
  }
}

/** The scheduler's batch: a few due rows, verified strictly in sequence.
 *  When the receive switch is off the whole queue drains — the endpoint
 *  has been answering 410, so nothing queued can still be accepted. The
 *  switch read shares the endpoint's `isWebmentionReceiveEnabled`
 *  predicate (an unseeded section reads as the default ON). */
export async function runWebmentionInboxBatch(db: Database): Promise<number> {
  if (!isWebmentionReceiveEnabled(getBlogSettingsBundleSync())) {
    const dropped = await clearWebmentionInbox(db)
    if (dropped > 0) {
      log.info('Webmention inbox drained (receive disabled)', { dropped })
    }
    return 0
  }
  const rows = await pickDueWebmentionInbox(db, new Date(), INBOX_BATCH_SIZE)
  for (const row of rows) {
    try {
      await processWebmentionInboxRow(db, row)
    } catch (error: unknown) {
      // A row must never kill the batch: processWebmentionInboxRow only
      // rethrows on a DB failure of its own bookkeeping, which a retry
      // mark would likely hit too — log and move on; the row stays due
      // and the next wake-up takes another turn at it.
      log.warn('Webmention inbox row processing threw', { id: row.id, error: String(error) })
    }
  }
  return rows.length
}
