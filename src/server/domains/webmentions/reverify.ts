import type { WebmentionType } from '@/server/domains/webmentions/classify'
import type { SourceMetadata } from '@/server/domains/webmentions/verify'
import type { Database } from '@/server/infra/db/database'
import type { WebmentionRow } from '@/server/infra/db/types'

import { verifyWebmentionSource } from '@/server/domains/webmentions/service'
import { resolveWebmentionTarget } from '@/server/domains/webmentions/target'
import {
  applyWebmentionReverifyFailure,
  applyWebmentionReverifySuccess,
  findWebmentionById,
  pickWebmentionsDueForReverify,
} from '@/server/infra/db/operations/webmention'
import { DomainError } from '@/server/infra/http/errors'
import { getLogger } from '@/server/infra/logger'
import { idFromString } from '@/shared/utils/id'

const log = getLogger('webmentions.reverify')

// Daily re-verification cycle: approved/pending rows are re-checked per 24h
// waterline; an `approved` row's 7th consecutive failure flips to `hidden`,
// which only the admin's manual re-verification can recover.

export const REVERIFY_BATCH_SIZE = 10

/** Consecutive daily failures that move an `approved` row to `hidden`. */
export const WEBMENTION_HIDE_STREAK = 7

type VerifySuccess = { ok: true; meta: SourceMetadata; type: WebmentionType }
type VerifyFailure = { ok: false; error: string }
type VerifyOutcome = VerifySuccess | VerifyFailure

/** One row's check: a missing target is a permanent failure (counts toward
 *  the hide streak); one attempt per day by design. */
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

/** The scheduler's batch: success refreshes metadata and resets the streak;
 *  failure bumps it and hides the row once the budget is spent. */
export async function runWebmentionReverifyBatch(db: Database): Promise<number> {
  const rows = await pickWebmentionsDueForReverify(db, new Date(), REVERIFY_BATCH_SIZE)
  for (const row of rows) {
    try {
      const outcome = await checkRow(db, row)
      if (outcome.ok) {
        await applyWebmentionReverifySuccess(db, row.id, { ...outcome.meta, type: outcome.type, restoreStatus: false })
        continue
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
    } catch (error) {
      // A row must never kill the batch: log and move on; the row stays due.
      log.warn('Webmention reverify row processing threw', { id: row.id, error: String(error) })
    }
  }
  return rows.length
}

/**
 * Admin manual re-verification — the only recovery path for `hidden`
 * (`rejected` is terminal); failure records but does not touch streak/waterline.
 */
export async function reverifyWebmention(db: Database, id: string): Promise<WebmentionRow> {
  const row = await findWebmentionById(db, idFromString(id))
  if (row === null) {
    throw new DomainError('NOT_FOUND', 'Webmention 不存在。')
  }
  if (row.status === 'rejected') {
    throw new DomainError('BAD_REQUEST', '已拒绝的 Webmention 不再参与验证。')
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
    restoreStatus: row.status === 'hidden',
  })
  if (updated === null) {
    throw new DomainError('NOT_FOUND', 'Webmention 不存在。')
  }
  return updated
}
