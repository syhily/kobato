import type { Database } from '@/server/infra/db/database'
import type { SafeUser } from '@/server/infra/db/operations/user'
import type { Role } from '@/shared/utils/roles'

import { recordAuditEvent } from '@/server/domains/audit/services/record'
import { recordSessionActivity, recordSessionLogin } from '@/server/domains/auth/repo'
import { revokeAllSessionsOfUser } from '@/server/domains/auth/services/sessions'
import {
  type BlogSession,
  buildSessionWithSid,
  commitSessionWithMaxAge,
  destroySession,
  getRequestSession,
  resolveSessionMaxAge,
  type SessionUser,
} from '@/server/domains/auth/session-storage'
import { findUserById, updateLastLogin } from '@/server/infra/db/operations/user'
import { DomainError } from '@/server/infra/http/errors'
import { getLogger } from '@/server/infra/logger'
import { idFromString } from '@/shared/utils/id'

export interface SessionContext {
  session: BlogSession
  user: SessionUser | undefined
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

/**
 * Establish a login session after ANY successful credential check. Owns
 * the entire login side-effect surface; callers MUST NOT re-write
 * `last_login` or record a second login audit.
 */
export async function establishLoginSession(
  db: Database,
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
    await revokeAllSessionsOfUser(db, dbUser.id)
  }
  if (session.id) {
    await destroySession(session)
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
  // Only the NEW session carries the user; the old one is never committed.
  const newSession = buildSessionWithSid(sid, { user: userData, absoluteExpiry })
  const setCookie = await commitSessionWithMaxAge(newSession)
  const userAgent = request.headers.get('User-Agent')
  const platformHint = request.headers.get('Sec-CH-UA-Platform')
  await updateLastLogin(db, dbUser.id, clientAddress, userAgent)
  try {
    await recordSessionLogin(db, {
      sid,
      userId: dbUser.id,
      userAgent,
      platformHint,
      ip: clientAddress,
    })
  } catch {
    // Best-effort: don't block auth on a meta-write hiccup.
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

export function userSession(session: BlogSession): SessionUser | undefined {
  return session.get('user')
}

export async function logout(session: BlogSession): Promise<void> {
  // Dropping `user` marks the session dirty; the commit clears the row owner.
  session.unset('user')
}

export async function resolveSessionContext(
  db: Database,
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
    if (dbUser?.role && !dbUser.deletedAt) {
      const upgraded: SessionUser = {
        id: `${dbUser.id}`,
        name: dbUser.name,
        email: dbUser.email,
        website: dbUser.link,
        role: dbUser.role,
      }
      session.set('user', upgraded)
      user = upgraded
    } else {
      session.unset('user')
      user = undefined
    }
    dirty = true
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
    recordSessionActivity(db, session.id)
  }

  return { session, user, dirty }
}
