import type { Database } from '@kobato/db/database'
import type { WebmentionRow } from '@kobato/db/types'
import type { WebmentionType } from '@kobato/server/domains/webmentions/classify'
import type { SourceMetadata } from '@kobato/server/domains/webmentions/verify'

import {
  applyWebmentionReverifyFailure,
  applyWebmentionReverifySuccess,
  findWebmentionById,
  hideExhaustedPendingWebmentions,
  pickWebmentionsDueForReverify,
  WEBMENTION_HIDE_STREAK,
} from '@kobato/db/operations/webmention'
import { runDueRows } from '@kobato/server/domains/webmentions/queue-scheduler'
import { verifyWebmentionSource } from '@kobato/server/domains/webmentions/receive'
import { resolveWebmentionTarget } from '@kobato/server/domains/webmentions/target'
import { descriptorFor } from '@kobato/server/infra/http/error-descriptor'
import { DomainError } from '@kobato/server/infra/http/errors'
import { getLogger } from '@kobato/server/infra/logger'
import { idFromString } from '@kobato/utils/id'

const log = getLogger('webmentions.reverify')

export const REVERIFY_BATCH_SIZE = 10

type VerifySuccess = { ok: true; meta: SourceMetadata; type: WebmentionType }
type VerifyFailure = { ok: false; error: string }
type VerifyOutcome = VerifySuccess | VerifyFailure

async function checkRow(db: Database, row: WebmentionRow): Promise<VerifyOutcome> {
  const target = await resolveWebmentionTarget(db, row.targetUrl)
  if (target === null) {
    return { ok: false, error: 'target is not a resource on this site' }
  }
  try {
    const { meta, type } = await verifyWebmentionSource(row.sourceUrl, target.canonicalUrl)
    return { ok: true, meta, type }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

async function applyDailyOutcome(db: Database, row: WebmentionRow, outcome: VerifyOutcome): Promise<void> {
  if (outcome.ok) {
    await applyWebmentionReverifySuccess(db, row.id, { ...outcome.meta, type: outcome.type })
    return
  }
  const updated = await applyWebmentionReverifyFailure(db, row.id, {
    lastError: outcome.error,
    count: 'daily',
    hideStreak: WEBMENTION_HIDE_STREAK,
  })
  if (updated?.status === 'hidden') {
    log.info('Webmention hidden after consecutive verification failures', {
      id: row.id,
      streak: updated.verifyFailStreak,
    })
  }
}

export async function runWebmentionReverifyBatch(db: Database): Promise<number> {
  const swept = await hideExhaustedPendingWebmentions(db)
  if (swept > 0) {
    log.info('Exhausted pending webmentions hidden', { count: swept })
  }
  return runDueRows({
    pick: () => pickWebmentionsDueForReverify(db, new Date(), REVERIFY_BATCH_SIZE),
    handleRow: async (row) => applyDailyOutcome(db, row, await checkRow(db, row)),
    log,
    rowThrewMessage: 'Webmention reverify row processing threw',
  })
}

export async function reverifyWebmention(db: Database, id: string): Promise<WebmentionRow> {
  const row = await findWebmentionById(db, idFromString(id))
  if (row === null) {
    throw new DomainError('NOT_FOUND', descriptorFor('webmentions.error.notFound'))
  }
  if (row.status === 'rejected') {
    throw new DomainError('BAD_REQUEST', descriptorFor('webmentions.error.rejected'))
  }
  const outcome = await checkRow(db, row)
  if (!outcome.ok) {
    await applyWebmentionReverifyFailure(db, row.id, {
      lastError: outcome.error,
      count: 'manual',
      hideStreak: WEBMENTION_HIDE_STREAK,
    })
    throw new DomainError('BAD_REQUEST', outcome.error)
  }
  const updated = await applyWebmentionReverifySuccess(db, row.id, {
    ...outcome.meta,
    type: outcome.type,
  })
  if (updated === null) {
    throw new DomainError('NOT_FOUND', descriptorFor('webmentions.error.notFound'))
  }
  return updated
}
