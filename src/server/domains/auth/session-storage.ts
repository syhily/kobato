import type { Session } from 'react-router'
import type { SuperJSONResult } from 'superjson'

import { and, eq, gt } from 'drizzle-orm'
import { createSession, createSessionStorage } from 'react-router'
import superjson from 'superjson'

import type { Role } from '@/shared/utils/roles'

import { getDb } from '@/server/bootstrap/db-lifecycle'
import { session as sessionTable } from '@/server/infra/db/schema/session'
import { SESSION_SECRET } from '@/server/infra/env'
import { getLogger } from '@/server/infra/logger'
import { getBlogSettingsBundleSync } from '@/shared/config/getters'
import { idFromString } from '@/shared/utils/id'
import { isRecord } from '@/shared/utils/type-guards'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

const log = getLogger('auth.session-storage')

export interface SessionUser {
  id: string
  name: string
  email: string
  website: string | null
  // Invariant: present on every user row in a session. Writes go
  // through `establishLoginSession`, which throws on `!dbUser.role`,
  // so a session with a user but no role is unreachable at runtime.
  role: Role
}

export interface PendingOtpUser {
  userId: string
  email: string
  expiresAt: number
  sentAt: number
}

export interface BlogSessionData {
  // Invariant: if `user` is present, `user.role` is non-null.
  // The single writer is `establishLoginSession` (in `primitives.ts`),
  // which throws on `!dbUser.role` — so no callable code path can
  // produce a stored session with `user` but missing role.
  user?: SessionUser
  pendingOtpUser?: PendingOtpUser
  otpFailCount?: number
  csrfToken?: string
  // Absolute session expiry (epoch ms). When present, the session is
  // unconditionally invalid after this timestamp regardless of sliding
  // cookie refreshes. This caps the maximum lifetime of a stolen cookie.
  absoluteExpiry?: number
  setupTokenVerified?: boolean
}

export type BlogSession = Session<BlogSessionData, BlogSessionData>

export const SESSION_MAX_AGE = 60 * 60 * 24 * 14

export const SESSION_COOKIE_NAME = '__session'

function resolveSessionMaxAge(): number {
  const bundle = getBlogSettingsBundleSync()
  const configured = bundle?.limits?.sessionMaxAge
  return typeof configured === 'number' && configured > 0 ? configured : SESSION_MAX_AGE
}

export { resolveSessionMaxAge }

export async function commitSessionWithMaxAge(session: BlogSession): Promise<string> {
  return commitSession(session, { maxAge: resolveSessionMaxAge() })
}

const storage = createSessionStorage<BlogSessionData>({
  cookie: {
    name: SESSION_COOKIE_NAME,
    httpOnly: true,
    maxAge: SESSION_MAX_AGE,
    path: '/',
    sameSite: 'lax',
    secure: import.meta.env.PROD,
    secrets: SESSION_SECRET,
  },
  async createData(data, expires) {
    const id = crypto.randomUUID()
    await writeSession(id, data, expires)
    return id
  },
  async readData(id) {
    // Expired rows read as misses; the hourly sweep in
    // `infra/cache/kv-maintenance.ts` deletes them lazily.
    const rows = await getDb()
      .select({ data: sessionTable.data })
      .from(sessionTable)
      .where(and(eq(sessionTable.id, id), gt(sessionTable.expiresAt, new Date())))
      .limit(1)
    const row = rows[0]
    if (!row) {
      return null
    }
    try {
      // Rows written by `writeSession` always carry the superjson
      // envelope (`{ json, meta? }`); anything else reads as a miss.
      if (!isRecord(row.data) || !('json' in row.data)) {
        return null
      }
      return superjson.deserialize<BlogSessionData>(unsafeCast<SuperJSONResult>(row.data))
    } catch {
      log.warn('session parse failed', { id })
      return null
    }
  },
  async updateData(id, data, expires) {
    await writeSession(id, data, expires)
  },
  async deleteData(id) {
    await getDb().delete(sessionTable).where(eq(sessionTable.id, id))
  },
})

async function writeSession(id: string, data: BlogSessionData, expires: Date | undefined): Promise<void> {
  const db = getDb()
  const payload = superjson.serialize(data)
  const expiresAt = expires ?? new Date(Date.now() + resolveSessionMaxAge() * 1000)
  // The `user_id` column is derived from the payload on every write: an
  // OTP-pending session carries only `pendingOtpUser` (NULL); once the
  // login completes the session is rewritten with `user` and the column
  // picks up the owner. This derived column is what replaced the
  // `user_sessions:<uid>` set.
  const userId = data.user ? idFromString(data.user.id) : null
  await db
    .insert(sessionTable)
    .values({ id, userId, data: payload, expiresAt })
    .onConflictDoUpdate({
      target: sessionTable.id,
      // Never touch the meta columns (user_agent, ip, login_at, …) on a
      // payload rewrite — they are owned by `repo.ts::recordSessionLogin`.
      set: { userId, data: payload, expiresAt },
    })
}

export const { getSession, commitSession, destroySession } = storage

export async function getRequestSession(request: Request): Promise<BlogSession> {
  return getSession(request.headers.get('Cookie'))
}

/**
 * Construct a `BlogSession` whose `id` is set to a caller-chosen sid
 * before the cookie is ever serialised. React Router's `Session.id` is
 * a closed-over `let` set once at creation — calling `commitSession`
 * does NOT mutate it. So if the login path wants to know the sid
 * before doing its session-row bookkeeping (so the `user_id` column and
 * the meta columns land against the real cookie sid), it must mint the
 * sid itself and feed it to `createSession`.
 *
 * `commitSession(buildSessionWithSid(sid, data))` then takes the
 * `id` branch (`updateData(id, data, expires)`) and writes the session
 * row with our pre-chosen id intact. The returned Set-Cookie header
 * carries the same `<sid>` signed against the cookie secret, so the
 * next request's cookie correctly resolves back to that row.
 */
export function buildSessionWithSid(sid: string, data: BlogSessionData): BlogSession {
  return createSession<BlogSessionData, BlogSessionData>(data, sid)
}
