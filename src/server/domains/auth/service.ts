// Session orchestration: listing, scanning, and orphan cleanup that
// composes the raw data-access primitives from `repo.ts`. Keeps `repo.ts`
// lean (direct Redis reads/writes) per the domain locked vocabulary.

import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import type { SessionMeta, SessionWithUser } from '@/server/domains/auth/repo'

import { findSessionMeta, META_KEY, parseMeta, revokeSessionById, USER_SET_KEY } from '@/server/domains/auth/repo'
import { findSafeUserById, findUsersByIds } from '@/server/infra/db/operations/user'
import { DomainError } from '@/server/infra/http/errors'
import { getLogger } from '@/server/infra/logger'
import { redisInstance } from '@/server/infra/redis/storage'

const log = getLogger('auth.sessions')

function cleanOrphanMetas(orphanSids: string[]): void {
  if (orphanSids.length === 0) {
    return
  }
  const redis = redisInstance()
  const cleanup = redis.pipeline()
  for (const sid of orphanSids) {
    cleanup.del(META_KEY(sid))
  }
  void cleanup.exec().catch((error) => log.warn('orphan cleanup failed', { error: String(error) }))
}

/**
 * Pipeline `EXISTS session:<sid>` against every candidate sid in one
 * round trip. Any sid whose cookie blob is gone counts as orphaned —
 * `user_sessions:<userId>` and `session_meta:<sid>` both get lazily
 * dropped (best-effort; pipeline failure does not block the caller).
 * Returns only sids whose cookie blob is still live.
 */
async function filterLiveSidsAndCleanOrphans(sids: string[], userId: bigint): Promise<string[]> {
  const redis = redisInstance()
  const existsPipeline = redis.pipeline()
  for (const sid of sids) {
    existsPipeline.exists(`session:${sid}`)
  }
  const results = await existsPipeline.exec()
  const live: string[] = []
  const orphans: string[] = []
  sids.forEach((sid, i) => {
    const [, exists] = results?.[i] ?? [null, 0]
    if (exists === 1) {
      live.push(sid)
    } else {
      orphans.push(sid)
    }
  })
  if (orphans.length > 0) {
    const cleanup = redis.pipeline()
    for (const sid of orphans) {
      cleanup.del(META_KEY(sid))
      cleanup.srem(USER_SET_KEY(userId), sid)
    }
    void cleanup.exec().catch((error) => {
      log.warn('failed to clean orphan sessions', { error: String(error) })
    })
  }
  return live
}

const MAX_SESSIONS_SCAN = 10_000

/**
 * Enumerate every active session for one user. Reads
 * `user_sessions:<id>` and joins each entry to its meta hash. Stale
 * ids (set entry exists but the meta hash has been evicted by Redis
 * eviction or a manual cleanup) are filtered out — they would render
 * as empty rows in the UI.
 */
export async function listSessionsByUser(db: NodePgDatabase, userId: bigint): Promise<SessionMeta[]> {
  const redis = redisInstance()
  const sids = await redis.smembers(USER_SET_KEY(userId))
  if (sids.length === 0) {
    return []
  }
  const realSids = sids.filter((sid) => sid !== '')
  if (realSids.length === 0) {
    return []
  }
  const liveSids = await filterLiveSidsAndCleanOrphans(realSids, userId)
  if (liveSids.length === 0) {
    return []
  }
  const metaPipeline = redis.pipeline()
  for (const sid of liveSids) {
    metaPipeline.hgetall(META_KEY(sid))
  }
  const metaResults = await metaPipeline.exec()
  const metas = liveSids.map((sid, i) => {
    const [, hash] = metaResults?.[i] ?? [null, {}]
    return parseMeta(sid, hash as Record<string, string>)
  })
  return metas.filter((meta): meta is SessionMeta => meta !== null && meta.userId === userId)
}

/**
 * Enumerate every active session across the site. Uses `SCAN` over
 * `session_meta:*` so we never block the Redis main thread, and joins
 * results against the `user` table in a single bulk read.
 *
 * Soft-capped at `MAX_SESSIONS_SCAN` sids to bound memory usage on
 * long-running deployments.
 */
export async function listAllSessions(db: NodePgDatabase): Promise<SessionWithUser[]> {
  const redis = redisInstance()
  const sids: string[] = []
  let cursor = '0'
  do {
    const [next, keys] = (await redis.scan(cursor, 'MATCH', 'session_meta:*', 'COUNT', 500)) as [string, string[]]
    cursor = next
    for (const key of keys) {
      sids.push(key.slice('session_meta:'.length))
    }
  } while (cursor !== '0' && sids.length < MAX_SESSIONS_SCAN)
  if (sids.length === 0) {
    return []
  }
  const realSids = sids.filter((sid) => sid !== '')
  if (realSids.length === 0) {
    return []
  }
  const existsPipeline = redis.pipeline()
  for (const sid of realSids) {
    existsPipeline.exists(`session:${sid}`)
  }
  const existsResults = await existsPipeline.exec()
  const liveSids: string[] = []
  const orphanSids: string[] = []
  realSids.forEach((sid, i) => {
    const [, exists] = existsResults?.[i] ?? [null, 0]
    if (exists === 1) {
      liveSids.push(sid)
    } else {
      orphanSids.push(sid)
    }
  })
  if (liveSids.length === 0) {
    cleanOrphanMetas(orphanSids)
    return []
  }
  const metaPipeline = redis.pipeline()
  for (const sid of liveSids) {
    metaPipeline.hgetall(META_KEY(sid))
  }
  const metaResults = await metaPipeline.exec()
  const metas = liveSids.map((sid, i) => {
    const [, hash] = metaResults?.[i] ?? [null, {}]
    return parseMeta(sid, hash as Record<string, string>)
  })
  const validMetas = metas.filter((meta): meta is SessionMeta => meta !== null)
  cleanOrphanMetas(orphanSids)
  if (validMetas.length === 0) {
    return []
  }
  const uniqueIds = Array.from(new Set(validMetas.map((m) => m.userId)))
  const users = await findUsersByIds(db, uniqueIds)
  const userById = new Map(users.map((u) => [u.id.toString(), u]))
  return validMetas.map((meta) => {
    const u = userById.get(meta.userId.toString())
    return {
      ...meta,
      userName: u?.name ?? '已删除的用户',
      userEmail: u?.email ?? '',
      userRole: u?.role ?? null,
    }
  })
}

// Revoke session with RBAC guard

export async function revokeSessionWithGuard(
  db: NodePgDatabase,
  sessionId: string,
  actorId: string,
  actorRole: string | null | undefined,
): Promise<{ targetUserId: bigint | null }> {
  const meta = await findSessionMeta(sessionId)
  if (!meta) {
    return { targetUserId: null }
  }
  // Ownership check: an admin may not revoke another admin's session
  // unless it is their own session. This prevents privilege escalation
  // where a compromised admin account kicks out all other admins.
  if (actorRole === 'admin' && meta.userId.toString() !== actorId) {
    const targetUser = await findSafeUserById(db, meta.userId)
    if (targetUser && !targetUser.deletedAt && targetUser.role === 'admin') {
      throw new DomainError('FORBIDDEN', '无权撤销其他管理员的会话。')
    }
  }
  await revokeSessionById(sessionId, meta.userId)
  return { targetUserId: meta.userId }
}
