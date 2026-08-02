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

// The daily re-verification cycle: approved mentions (and pending ones
// whose receive-time check failed) are re-fetched once per 24h waterline
// to confirm the source still exists and still links to the target. A
// failure records the message and bumps the streak; an `approved` row's
// 7th consecutive daily failure flips it to `hidden` — off the public
// page and out of the cycle. `hidden` rows only recover through the
// admin's manual re-verification.

export const REVERIFY_BATCH_SIZE = 10

/** Consecutive daily failures that move an `approved` row to `hidden`. */
export const WEBMENTION_HIDE_STREAK = 7

type VerifySuccess = { ok: true; meta: SourceMetadata; type: WebmentionType }
type VerifyFailure = { ok: false; error: string }
type VerifyOutcome = VerifySuccess | VerifyFailure

/**
 * One row's check: resolve the target (it may have been deleted or
 * reverted to draft since approval — a missing target is a permanent
 * failure, not a transient one, and counts toward the hide streak), then
 * run the shared fetch-and-link verification. A single attempt per day
 * by design: a transient outage just counts as that day's failure.
 */
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

/** The scheduler's batch: re-check a few due rows, strictly in sequence
 *  (the same third-party-politeness discipline as the inbox/outbox
 *  workers). Success refreshes the metadata and resets the streak;
 *  failure records the message and bumps it — atomically, inside the
 *  failure write — hiding the row once the consecutive-day budget is
 *  spent. Returns the processed count. */
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
      if (updated !== null && updated.status === 'hidden') {
        log.info('Webmention hidden after consecutive verification failures', {
          id: row.id,
          streak: updated.verifyFailStreak,
        })
      }
    } catch (error) {
      // A row must never kill the batch (same discipline as the inbox
      // worker): a DB hiccup or an unexpected throw leaves the row due
      // (its waterline is unchanged), so the next wake-up takes another
      // turn at it.
      log.warn('Webmention reverify row processing threw', { id: row.id, error: String(error) })
    }
  }
  return rows.length
}

/**
 * The admin's manual re-verification — the ONLY recovery path for a
 * `hidden` mention (the daily cycle deliberately leaves hidden rows
 * alone). Success flips `hidden` back to `approved` and resets the
 * streak; failure records the message on the row (streak and the 24h
 * waterline untouched — the consecutive-day count belongs to the daily
 * cycle, and a failed attempt must not delay the next scheduled check)
 * and rethrows so the admin sees why. `rejected` rows are terminal and
 * never re-verified through this path.
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
