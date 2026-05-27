import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'

import type { User } from '@/server/infra/db/types'

import { recordAuditEvent } from '@/server/domains/audit/service'
import { type Role } from '@/server/domains/auth/rbac'
import { recordSessionActivity, recordSessionLogin } from '@/server/domains/auth/repo'
import {
  type BlogSession,
  buildSessionWithSid,
  commitSessionWithMaxAge,
  getRequestSession,
  revokeAllSessionsOfUser,
  type SessionUser,
} from '@/server/domains/auth/session-storage'
import { findUserById, updateLastLogin, verifyUserPassword } from '@/server/infra/db/operations/user'
import { DomainError } from '@/server/infra/http/errors'
import { getLogger } from '@/server/infra/logger'
import { redisInstance } from '@/server/infra/redis/storage'
import { idFromString } from '@/shared/utils/id'

export interface SessionContext {
  session: BlogSession
  user: SessionUser | undefined
  role: Role | null
}

export interface EstablishLoginOptions {
  /**
   * Revoke every OTHER session of this user before establishing the
   * new one. Required for credential-rotating flows (password reset,
   * accept-invite) where the very point of the operation is "kick
   * everyone else off". Default `false` — a fresh login should not
   * pre-emptively burn down concurrent sessions.
   */
  revokeOtherSessions?: boolean
}

/**
 * Write the session for a freshly-authenticated user and record the
 * session id under `user_sessions:<id>` so a future
 * `revokeAllSessionsOfUser` finds and clears it. Shared by password
 * login, install flow, password reset, and accept-invite — all four
 * code paths used to copy this block by hand and one of them (the
 * password-reset action) was silently leaving the user out of the
 * revocation set.
 *
 * Pass `{ revokeOtherSessions: true }` on credential-rotation paths
 * to kill stale cookies from the same account before issuing the
 * new one.
 */
export interface EstablishedLoginSession {
  /** The newly-minted session id (decoupled from any prior cookie). */
  sid: string
  /** `Set-Cookie` header value — callers MUST attach it to the response. */
  setCookie: string
}

export async function establishLoginSession(
  db: NodePgDatabase,
  pool: Pool,
  session: BlogSession,
  dbUser: User,
  request: Request,
  clientAddress: string,
  options: EstablishLoginOptions = {},
): Promise<EstablishedLoginSession> {
  if (!dbUser.role) {
    getLogger('auth').error('establishLoginSession called for user without role', {
      userId: String(dbUser.id),
      email: dbUser.email,
    })
    throw new DomainError('INTERNAL', 'establishLoginSession requires a user with a role')
  }
  if (options.revokeOtherSessions) {
    await revokeAllSessionsOfUser(dbUser.id)
  }
  // We control the sid ourselves rather than letting React Router's
  // `createData` mint one inside `commitSession`. Reason: React Router's
  // `Session.id` is set ONCE at session creation and `commitSession`
  // does not mutate it back onto the inbound session object. Without
  // this manual sid we couldn't read the cookie sid in time to
  // index `user_sessions:<userId>` or write the `session_meta:<sid>`
  // hash — every Redis bookkeeping write would key off an empty
  // string (the inbound session's empty default id), leaving the
  // cookie pointing at a session blob that's invisible to the
  // session-management views.
  const sid = crypto.randomUUID()
  const userData: SessionUser = {
    id: `${dbUser.id}`,
    name: dbUser.name,
    email: dbUser.email,
    website: dbUser.link,
    role: dbUser.role,
  }
  // Mirror the new state into the inbound session object so the rest
  // of the request handler sees `userSession(session)` return the
  // freshly-authenticated user. The cookie itself is minted from the
  // sid-pinned `newSession` below.
  session.set('user', userData)
  const newSession = buildSessionWithSid(sid, { user: userData })
  const setCookie = await commitSessionWithMaxAge(newSession)
  const userAgent = request.headers.get('User-Agent')
  await updateLastLogin(db, dbUser.id, clientAddress, userAgent)
  await redisInstance().sadd(`user_sessions:${dbUser.id}`, sid)
  // Persist the per-session metadata that powers /my/sessions and
  // /admin/security/sessions. Best-effort: any Redis hiccup here would
  // otherwise force a fresh login to fail, even though the cookie is
  // already valid. We log and continue.
  try {
    await recordSessionLogin({
      sid,
      userId: dbUser.id,
      userAgent,
      ip: clientAddress,
    })
  } catch {
    // The audit row is recoverable on next login; do not block the
    // user's auth flow.
  }

  recordAuditEvent(db, pool, {
    action: 'login',
    resourceType: 'session',
    resourceId: sid,
    actorId: dbUser.id,
    actorRole: dbUser.role,
    ipAddress: clientAddress,
    userAgent,
    details: {
      method: options.revokeOtherSessions ? 'credential_rotation' : 'password',
    },
  })

  return { sid, setCookie }
}

export async function login(
  db: NodePgDatabase,
  pool: Pool,
  {
    email,
    password,
    session,
    request,
    clientAddress,
  }: {
    email: string
    password: string
    session: BlogSession
    request: Request
    clientAddress: string
  },
): Promise<EstablishedLoginSession | null> {
  const user = await verifyUserPassword(db, email, password)
  if (user === null || !user.role) {
    // Users without a role cannot log in (anonymous placeholder accounts).
    return null
  }
  return establishLoginSession(db, pool, session, user, request, clientAddress)
}

export function userSession(session: BlogSession): SessionUser | undefined {
  return session.get('user')
}

export async function logout(session: BlogSession): Promise<void> {
  const user = userSession(session)
  if (user) {
    const sid = session.id
    const redis = redisInstance()
    await redis.srem(`user_sessions:${user.id}`, sid)
    // Drop the parallel meta hash so the admin / self-service views
    // stop listing a session whose cookie is no longer valid.
    await redis.del(`session_meta:${sid}`)
  }
  session.unset('user')
}

export async function resolveSessionContext(
  db: NodePgDatabase,
  request: Request,
): Promise<SessionContext & { dirty: boolean }> {
  const session = await getRequestSession(request)
  let user = userSession(session)
  let dirty = false

  // Back-compat: upgrade legacy cookies that lack `role` by hitting the DB once.
  // The migration to drop `user.is_admin` runs in a follow-up release, so
  // cookies minted before this branch still carry `{ admin: boolean }`
  // and no `role`. We can't trust the cookie for the upgrade — the
  // authoritative answer lives in `user.role`.
  if (user && typeof (user as { role?: Role }).role !== 'string') {
    let dbUser: Awaited<ReturnType<typeof findUserById>> = null
    let dbReachable = true
    try {
      dbUser = await findUserById(db, idFromString(user.id))
    } catch (err) {
      // Transient DB error — keep the existing session intact and try
      // again on the next request. Unsetting `user` here would log out
      // every active session every time the DB has a hiccup.
      getLogger('auth').warn('transient db error during session back-compat lookup', {
        err: err instanceof Error ? err.message : String(err),
        userId: user.id,
      })
      dbReachable = false
    }
    if (dbUser && dbUser.role) {
      const upgraded: SessionUser = {
        id: `${dbUser.id}`,
        name: dbUser.name,
        email: dbUser.email,
        website: dbUser.link,
        role: dbUser.role,
      }
      session.set('user', upgraded)
      user = upgraded
      dirty = true
    } else if (dbReachable) {
      // Account confirmed gone-or-demoted: drop the session so they
      // re-login. Only on a successful DB read — see comment above.
      session.unset('user')
      user = undefined
      dirty = true
    }
  }

  // Fire-and-forget: bump `lastActiveAt` and PEXPIRE the meta hash
  // alongside the session cookie's sliding refresh, so the
  // session-management views show truthful "最近活跃" timestamps.
  // Must NOT block the request — the helper internally voids the
  // promise and catches errors.
  if (user) {
    recordSessionActivity(session.id)
  }

  return { session, user, role: user?.role ?? null, dirty }
}
