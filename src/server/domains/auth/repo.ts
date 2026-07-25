// Session metadata data-access layer. The cookie-backed session storage
// lives in `session-storage.ts` (signed `__session` cookie + `session:<sid>`
// blob in Redis); this module owns the PARALLEL `session_meta:<sid>`
// hash that powers `/my/sessions` and `/admin/security/sessions`.
//
// Orchestration (listing, scanning, orphan cleanup) lives in `service.ts`.
// This module is limited to raw Redis reads/writes and their helpers.

import type { Role } from '@/shared/utils/roles'

import { resolveSessionMaxAge } from '@/server/domains/auth/session-storage'
import { getLogger } from '@/server/infra/logger'
import { redisInstance } from '@/server/infra/redis/storage'
import { idFromString } from '@/shared/utils/id'

const log = getLogger('auth.sessions')

const USER_AGENT_MAX_LENGTH = 512

const META_KEY = (sid: string) => `session_meta:${sid}`
const USER_SET_KEY = (userId: bigint | string) => `user_sessions:${userId}`

export interface SessionMeta {
  sid: string
  userId: bigint
  userAgent: string
  platformHint: string | null
  ip: string
  loginAt: Date
  lastActiveAt: Date
  expiresAt: Date
}

export interface SessionWithUser extends SessionMeta {
  userName: string
  userEmail: string
  userRole: Role | null
}

interface RecordLoginInput {
  sid: string
  userId: bigint
  userAgent: string | null
  platformHint?: string | null
  ip: string
  /** Defaults to now. Overridable for tests. */
  loginAt?: Date
}

function truncateUserAgent(ua: string | null): string {
  if (!ua) {
    return ''
  }
  return ua.length > USER_AGENT_MAX_LENGTH ? ua.slice(0, USER_AGENT_MAX_LENGTH) : ua
}

/**
 * Persist the metadata for a freshly-established session. Called from
 * `establishLoginSession` AFTER the `user_sessions:<userId>` set has
 * been updated, so the meta hash can be looked up by SID without a
 * fallback scan.
 */
export async function recordSessionLogin(input: RecordLoginInput): Promise<void> {
  const redis = redisInstance()
  const now = input.loginAt ?? new Date()
  const loginMs = now.getTime()
  const expiresMs = loginMs + resolveSessionMaxAge() * 1000
  const fields = {
    userId: input.userId.toString(),
    userAgent: truncateUserAgent(input.userAgent),
    platformHint: input.platformHint ?? '',
    ip: input.ip,
    loginAt: String(loginMs),
    lastActiveAt: String(loginMs),
    expiresAt: String(expiresMs),
  }
  await redis.hset(META_KEY(input.sid), fields)
  // Pin the meta key to the same expiry as the session blob.
  await redis.pexpireat(META_KEY(input.sid), expiresMs)
}

/**
 * Fire-and-forget bump of `lastActiveAt` and the meta key's TTL. Called
 * from `resolveSessionContext` on every authenticated request — must
 * stay off the synchronous request path.
 *
 * The PEXPIRE keeps the meta hash aligned with the session cookie's
 * sliding-refresh: as long as the user is active, both the session
 * blob and the meta hash get pushed forward by `SESSION_MAX_AGE`.
 */
export function recordSessionActivity(sid: string): void {
  const redis = redisInstance()
  const now = Date.now()
  const newExpiresAt = now + resolveSessionMaxAge() * 1000
  void Promise.all([
    redis.hset(META_KEY(sid), {
      lastActiveAt: String(now),
      expiresAt: String(newExpiresAt),
    }),
    redis.pexpireat(META_KEY(sid), newExpiresAt),
  ]).catch((error) => {
    log.warn('failed to refresh session meta', { sid, error: String(error) })
  })
}

function parseMeta(sid: string, hash: Record<string, string>): SessionMeta | null {
  if (!hash || Object.keys(hash).length === 0) {
    return null
  }
  const userIdRaw = hash.userId
  if (!userIdRaw) {
    return null
  }
  let userId: bigint
  try {
    userId = idFromString(userIdRaw)
  } catch {
    return null
  }
  const loginAt = Number(hash.loginAt ?? '0')
  const lastActiveAt = Number(hash.lastActiveAt ?? '0')
  const expiresAt = Number(hash.expiresAt ?? '0')
  return {
    sid,
    userId,
    userAgent: hash.userAgent ?? '',
    platformHint: hash.platformHint || null,
    ip: hash.ip ?? '',
    loginAt: new Date(loginAt),
    lastActiveAt: new Date(lastActiveAt),
    expiresAt: new Date(expiresAt),
  }
}

/**
 * Revoke one session by its id. The cookie-side `session:<sid>` blob,
 * the `user_sessions:<userId>` index entry, and the `session_meta:<sid>`
 * hash are all dropped atomically (via a single pipeline) so a partial
 * delete cannot leave the admin view showing a session whose cookie
 * has already been invalidated.
 *
 * Role-blind: callers must go through `session-guard.ts` (own / admin /
 * bulk scopes) for the perimeter check.
 */
export async function revokeSessionById(sid: string, userId: bigint): Promise<void> {
  const redis = redisInstance()
  const pipeline = redis.pipeline()
  pipeline.del(`session:${sid}`)
  pipeline.del(META_KEY(sid))
  pipeline.srem(USER_SET_KEY(userId), sid)
  await pipeline.exec()
}

/**
 * Fetch one meta row by id. Returns `null` if Redis no longer has the
 * hash (the session expired or was already revoked). Used by the API
 * actions to confirm ownership before deleting.
 */
export async function findSessionMeta(sid: string): Promise<SessionMeta | null> {
  const redis = redisInstance()
  const hash = (await redis.hgetall(META_KEY(sid))) as Record<string, string>
  return parseMeta(sid, hash)
}

// Exposed for `service.ts` session-list orchestration.
export { parseMeta, META_KEY, USER_SET_KEY }
