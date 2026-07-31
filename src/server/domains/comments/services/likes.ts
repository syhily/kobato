import { startOfDay, subDays } from 'date-fns'

import type { Database } from '@/server/infra/db/database'
import type { EntityTarget } from '@/server/infra/db/target'

import {
  commentCountsByOwnerIds,
  consumeActiveLikeToken,
  existsActiveLikeToken,
  metricsByOwnerIds,
  metricVoteUp,
  purgeOldLikeTokens,
  recordLikeAndCount,
} from '@/server/infra/db/operations/like'
import { decrementMetricVotes } from '@/server/infra/db/operations/metric'
import { targetKey } from '@/server/infra/db/target'
import { getLogger } from '@/server/infra/logger'
import { makeToken } from '@/shared/utils/security'

const log = getLogger('comments.likes')

export async function increaseLikes(db: Database, target: EntityTarget): Promise<{ likes: number; token: string }> {
  // 64 base64url chars ≈ 48 bytes ≈ 384 bits of entropy.
  const token = makeToken(64)
  // Transactional: insert + bump + RETURNING new count run as one statement
  // pair so a concurrent decrement can't race in between and return us
  // yesterday's number.
  const likes = await recordLikeAndCount(db, token, target)
  return { likes, token }
}

/**
 * Consume a like token and decrement the counter. Returns `true` when
 * the token was live and the decrement landed; `false` when the token
 * was unknown, already consumed, or purged — in which case the count is
 * untouched and the caller must NOT report a successful unlike.
 */
export async function decreaseLikes(db: Database, target: EntityTarget, token: string): Promise<boolean> {
  // Transactional: consume + decrement run as one unit so a crash
  // between them cannot leave the count inflated while the token is
  // already gone.
  return db.transaction((tx) => {
    const consumed = consumeActiveLikeToken(tx, target, token)
    if (consumed) {
      decrementMetricVotes(tx, target)
    }
    return consumed
  })
}

export async function queryLikes(db: Database, target: EntityTarget): Promise<number> {
  return metricVoteUp(db, target)
}

/**
 * Batch metric read for a list of entity targets. Fans out per-type so
 * Drizzle stays on the cheap `eq + inArray` path. The returned map is
 * keyed on `targetKey(target)` so callers look up an entry without
 * juggling `(type, ownerId)` tuples; each value also carries the
 * metric `publicId` UUID for downstream wire-format usage.
 */
export async function queryMetadata(
  db: Database,
  targets: EntityTarget[],
  options: { likes: boolean; views: boolean; comments: boolean },
): Promise<Map<string, { likes: number; views: number; comments: number; publicId: string }>> {
  if (targets.length === 0) {
    return new Map()
  }
  const postIds = targets.filter((t) => t.type === 'post').map((t) => t.ownerId)
  const pageIds = targets.filter((t) => t.type === 'page').map((t) => t.ownerId)

  const [postMetrics, pageMetrics, postCommentCounts, pageCommentCounts] = await Promise.all([
    metricsByOwnerIds(db, 'post', postIds),
    metricsByOwnerIds(db, 'page', pageIds),
    options.comments ? commentCountsByOwnerIds(db, 'post', postIds) : Promise.resolve([]),
    options.comments ? commentCountsByOwnerIds(db, 'page', pageIds) : Promise.resolve([]),
  ])

  const metricByTarget = new Map<string, { like: number | null; view: number | null; publicId: string }>()
  for (const row of postMetrics) {
    metricByTarget.set(targetKey(row), row)
  }
  for (const row of pageMetrics) {
    metricByTarget.set(targetKey(row), row)
  }

  const commentCountByTarget = new Map<string, number>()
  for (const row of postCommentCounts) {
    commentCountByTarget.set(targetKey({ type: 'post', ownerId: row.ownerId }), row.count)
  }
  for (const row of pageCommentCounts) {
    commentCountByTarget.set(targetKey({ type: 'page', ownerId: row.ownerId }), row.count)
  }

  const out = new Map<string, { likes: number; views: number; comments: number; publicId: string }>()
  for (const target of targets) {
    const key = targetKey(target)
    const m = metricByTarget.get(key)
    out.set(key, {
      likes: m?.like ?? 0,
      views: m?.view ?? 0,
      comments: commentCountByTarget.get(key) ?? 0,
      publicId: m?.publicId ?? '',
    })
  }
  return out
}

/**
 * Validate if a like token exists and is valid (not deleted).
 */
export async function validateLikeToken(db: Database, target: EntityTarget, token: string): Promise<boolean> {
  return existsActiveLikeToken(db, target, token)
}

/**
 * Physically delete all soft-deleted like tokens older than 30 days. Safe to
 * call from a cron job; also invoked by the in-process sweep below.
 */
export async function purgeStaleLikeTokens(db: Database): Promise<void> {
  const thirtyDaysAgo = startOfDay(subDays(new Date(), 30))
  await purgeOldLikeTokens(db, thirtyDaysAgo)
}

/**
 * In-process sweep timer. Purges soft-deleted like tokens once an hour;
 * a module-level guard prevents duplicate timers.
 */
const SWEEP_INTERVAL_MS = 60 * 60 * 1000

let sweepTimer: NodeJS.Timeout | undefined
let sweepDb: Database | undefined

export function startLikeTokenSweep(db: Database): void {
  if (sweepTimer !== undefined) {
    return
  }
  sweepDb = db
  sweepTimer = setInterval(() => {
    if (sweepDb) {
      void purgeStaleLikeTokens(sweepDb).catch((err) => {
        log.warn('background sweep failed', { error: err })
      })
    }
  }, SWEEP_INTERVAL_MS)
  // Don't pin the Node event loop — the timer is purely opportunistic.
  sweepTimer.unref?.()
}

export function resetLikeTokenSweep(): void {
  if (sweepTimer !== undefined) {
    clearInterval(sweepTimer)
    sweepTimer = undefined
  }
}
