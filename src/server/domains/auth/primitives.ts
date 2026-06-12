import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import type { SafeUser } from '@/server/infra/db/operations/user'
import type { Role } from '@/shared/utils/roles'

import { recordAuditEvent } from '@/server/domains/audit/services/record'
import { recordSessionActivity, recordSessionLogin } from '@/server/domains/auth/repo'
import {
  type BlogSession,
  buildSessionWithSid,
  commitSessionWithMaxAge,
  destroySession,
  getRequestSession,
  revokeAllSessionsOfUser,
  resolveSessionMaxAge,
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
  revokeOtherSessions?: boolean
  authMethod?: string
}

export interface EstablishedLoginSession {
  /** The newly-minted session id (decoupled from any prior cookie). */
  sid: string
  /** `Set-Cookie` header value — callers MUST attach it to the response. */
  setCookie: string
}

export async function establishLoginSession(
  db: NodePgDatabase,
  session: BlogSession,
  dbUser: SafeUser,
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
  if (session.id) {
    await destroySession(session)
    await redisInstance().srem(`user_sessions:${dbUser.id}`, session.id)
  }
  const sid = crypto.randomUUID()
  const userData: SessionUser = {
    id: `${dbUser.id}`,
    name: dbUser.name,
    email: dbUser.email,
    website: dbUser.link,
    role: dbUser.role,
  }
  const absoluteExpiry = Date.now() + resolveSessionMaxAge() * 1000
  session.set('user', userData)
  const newSession = buildSessionWithSid(sid, { user: userData, absoluteExpiry })
  const setCookie = await commitSessionWithMaxAge(newSession)
  const userAgent = request.headers.get('User-Agent')
  await updateLastLogin(db, dbUser.id, clientAddress, userAgent)
  await redisInstance().sadd(`user_sessions:${dbUser.id}`, sid)
  try {
    await recordSessionLogin({
      sid,
      userId: dbUser.id,
      userAgent,
      ip: clientAddress,
    })
  } catch {
    // Best-effort: don't block auth on Redis hiccup.
  }

  recordAuditEvent({
    action: 'login',
    resourceType: 'session',
    resourceId: sid,
    actorId: dbUser.id,
    actorRole: dbUser.role,
    ipAddress: clientAddress,
    userAgent,
    details: {
      method: options.authMethod ?? (options.revokeOtherSessions ? 'credential_rotation' : 'password'),
    },
  })

  return { sid, setCookie }
}

export async function login(
  db: NodePgDatabase,
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
  return establishLoginSession(db, session, user, request, clientAddress)
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

  if (user && typeof (user as { role?: Role }).role !== 'string') {
    let dbUser: Awaited<ReturnType<typeof findUserById>> = null
    try {
      dbUser = await findUserById(db, idFromString(user.id))
    } catch (err) {
      getLogger('auth').warn('transient db error during session back-compat lookup', {
        err: err instanceof Error ? err.message : String(err),
        userId: user.id,
      })
    }
    if (dbUser && dbUser.role && !dbUser.deletedAt) {
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
    } else {
      session.unset('user')
      user = undefined
      dirty = true
    }
  }

  if (user) {
    const absoluteExpiry = session.get('absoluteExpiry') as number | undefined
    if (absoluteExpiry !== undefined && Date.now() > absoluteExpiry) {
      session.unset('user')
      user = undefined
      dirty = true
    }
  }

  if (user) {
    recordSessionActivity(session.id)
  }

  return { session, user, role: user?.role ?? null, dirty }
}
