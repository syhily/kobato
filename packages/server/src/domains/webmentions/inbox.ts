import type { Database } from '@kobato/db/database.ts'
import type { WebmentionInboxRow } from '@kobato/db/types.ts'

import {
  clearWebmentionInbox,
  deleteWebmentionInbox,
  markWebmentionInboxRetry,
  pickDueWebmentionInbox,
} from '@kobato/db/operations/webmention-inbox.ts'
import { upsertWebmentionVerificationFailure } from '@kobato/db/operations/webmention.ts'
import { runDueRows } from '@kobato/server/domains/webmentions/queue-scheduler.ts'
import { receiveWebmention } from '@kobato/server/domains/webmentions/receive.ts'
import { truncateFailureMessage, webmentionBackoffMs } from '@kobato/server/domains/webmentions/retry.ts'
import { resolveWebmentionTarget } from '@kobato/server/domains/webmentions/target.ts'
import { DomainError } from '@kobato/server/infra/http/errors.ts'
import { getLogger } from '@kobato/server/infra/logger.ts'
import { getBlogSettingsBundleSync, isWebmentionReceiveEnabled } from '@kobato/shared/config/getters.ts'

const log = getLogger('webmentions.inbox')

// Sequential single-worker verification loop: small batches, at least
// INBOX_MIN_DELAY_MS apart, so a burst cannot hammer source hosts back-to-back.
export const INBOX_BATCH_SIZE = 5
export const INBOX_MAX_ATTEMPTS = 3

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
        new Date(Date.now() + webmentionBackoffMs(attempts)),
        truncateFailureMessage(message),
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
  return runDueRows({
    pick: () => pickDueWebmentionInbox(db, new Date(), INBOX_BATCH_SIZE),
    handleRow: (row) => processWebmentionInboxRow(db, row),
    log,
    rowThrewMessage: 'Webmention inbox row processing threw',
  })
}
