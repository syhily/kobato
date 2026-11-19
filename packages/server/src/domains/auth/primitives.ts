import type { Role } from '@kobato/auth/roles.ts'
import type { Database } from '@kobato/db/database.ts'
import type { SafeUser } from '@kobato/db/operations/user.ts'

import { findUserById, updateLastLogin } from '@kobato/db/operations/user.ts'
import { recordAuditEvent } from '@kobato/server/domains/audit/services/record.ts'
import { recordSessionActivity, recordSessionLogin } from '@kobato/server/domains/auth/repo.ts'
import { revokeAllSessionsOfUser } from '@kobato/server/domains/auth/services/sessions.ts'
import {
  type BlogSession,
  buildSessionWithSid,
  commitSessionWithMaxAge,
  destroySession,
  getRequestSession,
  resolveSessionMaxAge,
  type SessionUser,
} from '@kobato/server/domains/auth/session-storage.ts'
import { DomainError } from '@kobato/server/infra/http/errors.ts'
import { getLogger } from '@kobato/server/infra/logger.ts'
import { idFromString } from '@kobato/utils/id.ts'

export interface SessionContext {
  session: BlogSession
  user: SessionUser | undefined
}

export interface EstablishLoginOptions {
  revokeOtherSessions?: boolean
  authMethod?: string
}

export interface EstablishedLoginSession {
  sid: string
  /** `Set-Cookie` header value — callers MUST attach it to the response. */
  setCookie: string
}

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
  } catch {}

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
