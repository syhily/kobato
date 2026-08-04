import type { Database } from '@kobato/server/infra/db/database'
import type { SafeUser } from '@kobato/server/infra/db/operations/user'
import type { Role } from '@kobato/shared/utils/roles'

import { recordAuditEvent } from '@kobato/server/domains/audit/services/record'
import { recordSessionActivity, recordSessionLogin } from '@kobato/server/domains/auth/repo'
import { revokeAllSessionsOfUser } from '@kobato/server/domains/auth/services/sessions'
import {
  type BlogSession,
  buildSessionWithSid,
  commitSessionWithMaxAge,
  destroySession,
  getRequestSession,
  getSessionFromTokenHeader,
  resolveSessionMaxAge,
  type SessionUser,
} from '@kobato/server/domains/auth/session-storage'
import { findUserById, updateLastLogin } from '@kobato/server/infra/db/operations/user'
import { DomainError } from '@kobato/server/infra/http/errors'
import { getLogger } from '@kobato/server/infra/logger'
import { idFromString } from '@kobato/shared/utils/id'

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
 * Establish a login session after ANY successful credential check
 * (password / OTP / passkey / setup). This function owns the ENTIRE
 * login side-effect surface: it destroys the anonymous session, mints
 * the new sid, writes `last_login`, and records the `login` audit event
 * (attributed to the NEW sid). Callers MUST NOT re-write last_login or
 * record a second login audit — doing so double-writes and (before this
 * contract was made explicit) attributed the duplicate audit to the
 * just-destroyed anonymous sid.
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
  // Only the NEW session object carries the user — the (destroyed) old one
  // is never committed again (the middleware skips its dirty-commit once
  // this response sets a `__session` cookie).
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
  // Dropping `user` marks the session dirty; the commit rewrites the
  // session row with no owner (`user_id` back to NULL), so the admin /
  // self-service views stop listing it and the cookie no longer resolves
  // to a logged-in user.
  session.unset('user')
}

export async function resolveSessionContext(
  db: Database,
  request: Request,
): Promise<SessionContext & { dirty: boolean }> {
  const session = await getRequestSession(request)
  const { user, dirty } = await normalizeSessionUser(db, session)
  if (user) {
    recordSessionActivity(db, session.id)
  }
  return { session, user, dirty }
}

/**
 * Resolve the member session carried by the `X-Kobato-Session-Token`
 * proxy-chain header (the signed `__session` cookie value; see
 * `getSessionFromTokenHeader`). The caller — `frontendKeyAuth` — has
 * already verified the frontend JWT, so the header is a trusted bearer
 * credential here. The session row is read-only: no dirty-commit channel
 * exists for a header-borne session (the browser's mirror cookie is owned
 * by the frontend domain), so normalization skips the write-back upgrade
 * path; the absolute-expiry gate still applies.
 */
export async function resolveSessionFromTokenHeader(db: Database, headerValue: string): Promise<SessionContext> {
  const session = await getSessionFromTokenHeader(headerValue)
  const { user } = await normalizeSessionUser(db, session)
  return { session, user }
}

async function normalizeSessionUser(
  db: Database,
  session: BlogSession,
): Promise<{ user: SessionUser | undefined; dirty: boolean }> {
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

  return { user, dirty }
}
