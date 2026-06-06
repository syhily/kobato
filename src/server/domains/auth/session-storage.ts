import type { Session } from 'react-router'

import { createSession, createSessionStorage } from 'react-router'
import superjson from 'superjson'

import type { Role } from '@/shared/utils/roles'

import { SESSION_SECRET } from '@/server/infra/env'
import { getLogger } from '@/server/infra/logger'
import { redisInstance } from '@/server/infra/redis/storage'
import { getBlogSettingsBundleSync } from '@/shared/config/getters'

const log = getLogger('auth.session-storage')

export type { Role } from '@/shared/utils/roles'

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
    name: '__session',
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
    const value = await redisInstance().get(`session:${id}`)
    if (!value) {
      return null
    }
    try {
      return superjson.parse<BlogSessionData>(value)
    } catch {
      log.warn('session parse failed', { id })
      return null
    }
  },
  async updateData(id, data, expires) {
    await writeSession(id, data, expires)
  },
  async deleteData(id) {
    await redisInstance().del(`session:${id}`)
  },
})

async function writeSession(id: string, data: BlogSessionData, expires: Date | undefined): Promise<void> {
  const redis = redisInstance()
  const payload = superjson.stringify(data)
  const ttl = resolveSessionMaxAge()
  if (expires) {
    await redis.set(`session:${id}`, payload, 'PXAT', expires.getTime())
  } else {
    await redis.set(`session:${id}`, payload, 'EX', ttl)
  }
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
 * before doing its Redis bookkeeping (so it can index
 * `user_sessions:<userId>` against the real cookie sid), it must
 * mint the sid itself and feed it to `createSession`.
 *
 * `commitSession(buildSessionWithSid(sid, data))` then takes the
 * `id` branch (`updateData(id, data, expires)`) and writes
 * `session:<sid>` with our pre-chosen id intact. The returned
 * Set-Cookie header carries the same `<sid>` signed against the
 * cookie secret, so the next request's cookie correctly resolves
 * back to `session:<sid>`.
 */
export function buildSessionWithSid(sid: string, data: BlogSessionData): BlogSession {
  return createSession<BlogSessionData, BlogSessionData>(data, sid)
}

/**
 * Revoke every session belonging to a user. Called after password change
 * or role downgrade so stale cookies cannot be reused.
 *
 * `exceptSessionId` keeps one session alive — used by self-service
 * password change so the user is not logged out from the tab that just
 * saved the new password.
 */
const REVOKE_SESSIONS_LUA = `
local setKey = KEYS[1]
local sessionPrefix = KEYS[2]
local sessionMetaPrefix = KEYS[3]
local except = ARGV[1]
local sids = redis.call('SMEMBERS', setKey)
for i = 1, #sids do
  local sid = sids[i]
  if sid ~= except then
    redis.call('DEL', sessionPrefix .. sid)
    redis.call('DEL', sessionMetaPrefix .. sid)
  end
end
if except == '' then
  redis.call('DEL', setKey)
else
  for i = 1, #sids do
    local sid = sids[i]
    if sid ~= except then
      redis.call('SREM', setKey, sid)
    end
  end
end
return #sids
`

export async function revokeAllSessionsOfUser(userId: bigint, exceptSessionId?: string): Promise<void> {
  const redis = redisInstance()
  const setKey = `user_sessions:${userId}`
  await redis.eval(REVOKE_SESSIONS_LUA, 3, setKey, 'session:', 'session_meta:', exceptSessionId ?? '')
}
