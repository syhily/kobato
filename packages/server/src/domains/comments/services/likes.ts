import type { Database } from '@kobato/db/database'
import type { EntityTarget } from '@kobato/db/target'

import { makeToken } from '@kobato/auth/security'
import {
  commentCountsByOwnerIds,
  consumeLikeAndDecrement,
  existsActiveLikeToken,
  metricsByOwnerIds,
  metricVoteUp,
  purgeOldLikeTokens,
  recordLikeAndCount,
} from '@kobato/db/operations/like'
import { targetKey } from '@kobato/db/target'
import { pendingViewDelta } from '@kobato/server/domains/analytics/services/pv-batcher'
import { getLogger } from '@kobato/server/infra/logger'
import { startOfDay, subDays } from 'date-fns'

const log = getLogger('comments.likes')

export async function increaseLikes(db: Database, target: EntityTarget): Promise<{ likes: number; token: string }> {
  const token = makeToken(64)
  const likes = await recordLikeAndCount(db, token, target)
  return { likes, token }
}

export async function decreaseLikes(db: Database, target: EntityTarget, token: string): Promise<boolean> {
  return consumeLikeAndDecrement(db, target, token)
}

export async function queryLikes(db: Database, target: EntityTarget): Promise<number> {
  return metricVoteUp(db, target)
}

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
      views: (m?.view ?? 0) + pendingViewDelta(target),
      comments: commentCountByTarget.get(key) ?? 0,
      publicId: m?.publicId ?? '',
    })
  }
  return out
}

export async function validateLikeToken(db: Database, target: EntityTarget, token: string): Promise<boolean> {
  return existsActiveLikeToken(db, target, token)
}

export async function purgeStaleLikeTokens(db: Database): Promise<void> {
  const thirtyDaysAgo = startOfDay(subDays(new Date(), 30))
  await purgeOldLikeTokens(db, thirtyDaysAgo)
}

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
  sweepTimer.unref?.()
}

export function resetLikeTokenSweep(): void {
  if (sweepTimer !== undefined) {
    clearInterval(sweepTimer)
    sweepTimer = undefined
  }
}
