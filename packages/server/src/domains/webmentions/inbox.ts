import type { Database } from '@kobato/db/database'
import type { WebmentionInboxRow } from '@kobato/db/types'

import { upsertWebmentionVerificationFailure } from '@kobato/db/operations/webmention'
import {
  clearWebmentionInbox,
  deleteWebmentionInbox,
  markWebmentionInboxRetry,
  pickDueWebmentionInbox,
} from '@kobato/db/operations/webmention-inbox'
import { runDueRows } from '@kobato/server/domains/webmentions/queue-scheduler'
import { receiveWebmention } from '@kobato/server/domains/webmentions/receive'
import { truncateFailureMessage, webmentionBackoffMs } from '@kobato/server/domains/webmentions/retry'
import { resolveWebmentionTarget } from '@kobato/server/domains/webmentions/target'
import { DomainError } from '@kobato/server/infra/http/errors'
import { getLogger } from '@kobato/server/infra/logger'
import { getBlogSettingsBundleSync, isWebmentionReceiveEnabled } from '@kobato/settings/getters'

const log = getLogger('webmentions.inbox')

export const INBOX_BATCH_SIZE = 5
export const INBOX_MAX_ATTEMPTS = 3

export async function processWebmentionInboxRow(db: Database, row: WebmentionInboxRow): Promise<void> {
  try {
    await receiveWebmention(db, { source: row.sourceUrl, target: row.targetUrl })
    await deleteWebmentionInbox(db, row.id)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
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
