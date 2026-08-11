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

// Sequential single-worker verification loop: small batches, at least
// INBOX_MIN_DELAY_MS apart, so a burst cannot hammer source hosts back-to-back.
export const INBOX_BATCH_SIZE = 5
export const INBOX_MAX_ATTEMPTS = 3

/** min(2^attempts × 60s, 12h) — attempts already incremented (1st failure waits 2m). */
export function inboxBackoffMs(attempts: number): number {
  return Math.min(2 ** attempts * 60_000, 12 * 3_600_000)
}

function failureMessage(error: string): string {
  return error.length > 200 ? `${error.slice(0, 200)}…` : error
}

/**
 * Verify one queued pair: success deletes the row, transient failures back
 * off; terminal failures are recorded visibly, except a vanished target (silent drop).
 */
export async function processWebmentionInboxRow(db: Database, row: WebmentionInboxRow): Promise<void> {
  try {
    await receiveWebmention(db, { source: row.sourceUrl, target: row.targetUrl })
    await deleteWebmentionInbox(db, row.id)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    // Non-DomainError throws count as transient — an internal hiccup must not silently drop a mention.
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

/** The scheduler's batch: due rows verified strictly in sequence; with the
 *  receive switch off the whole queue drains (nothing queued can be accepted). */
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
      // A row must never kill the batch: log and move on; the row stays due.
      log.warn('Webmention inbox row processing threw', { id: row.id, error: String(error) })
    }
  }
  return rows.length
}
