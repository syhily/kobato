import type { Database } from '@kobato/server/infra/db/database'
import type { Role } from '@kobato/shared/utils/roles'
import type { Session } from 'react-router'

import { serverConfig } from '@kobato/server/infra/config'
import { session as sessionTable } from '@kobato/server/infra/db/schema/session'
import { getLogger } from '@kobato/server/infra/logger'
import { getBlogSettingsBundleSync } from '@kobato/shared/config/getters'
import { SESSION_COOKIE_NAME } from '@kobato/shared/http/session-bridge'
import { idFromString } from '@kobato/shared/utils/id'
import { isRecord } from '@kobato/shared/utils/type-guards'
import { unsafeCast } from '@kobato/shared/utils/unsafe-cast'
import { and, eq, gt } from 'drizzle-orm'
import { createSession, createSessionStorage } from 'react-router'

const log = getLogger('auth.session-storage')

// The database handle is injected by the composition root
// (`@kobato/server/bootstrap/db-lifecycle`) at wire time — a direct import of
// the lifecycle here would invert the dependency direction (domain →
// composition root). Same injection discipline as `wireBackupScheduler`
// in `@kobato/server/domains/backup/scheduler`. Session reads/writes are
// load-bearing (unlike expendable telemetry), so an unwired call fails
// loudly instead of degrading.
let resolveDb: (() => Database) | null = null

export function wireSessionStorageDb(deps: { getDb: () => Database }): void {
  resolveDb = deps.getDb
}

function requireDb(): Database {
  if (resolveDb === null) {
    throw new Error('session storage used before wireSessionStorageDb')
  }
  return resolveDb()
}

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
    name: SESSION_COOKIE_NAME,
    httpOnly: true,
    maxAge: SESSION_MAX_AGE,
    path: '/',
    sameSite: 'lax',
    secure: import.meta.env.PROD,
    secrets: serverConfig.security.sessionSecret,
  },
  async createData(data, expires) {
    const id = crypto.randomUUID()
    await writeSession(id, data, expires)
    return id
  },
  async readData(id) {
    // Expired rows read as misses; the hourly sweep in
    // `infra/cache/kv-maintenance.ts` deletes them lazily.
    const rows = await requireDb()
      .select({ data: sessionTable.data })
      .from(sessionTable)
      .where(and(eq(sessionTable.id, id), gt(sessionTable.expiresAt, new Date())))
      .limit(1)
    const row = rows[0]
    if (!row) {
      return null
    }
    try {
      // `data` is plain JSON (superjson was dropped with the SQLite
      // migration — BlogSessionData is all strings/numbers/booleans).
      // Anything but an object reads as a miss.
      if (!isRecord(row.data)) {
        return null
      }
      return unsafeCast<BlogSessionData>(row.data)
    } catch {
      log.warn('session parse failed', { id })
      return null
    }
  },
  async updateData(id, data, expires) {
    await writeSession(id, data, expires)
  },
  async deleteData(id) {
    await requireDb().delete(sessionTable).where(eq(sessionTable.id, id))
  },
})

async function writeSession(id: string, data: BlogSessionData, expires: Date | undefined): Promise<void> {
  const db = requireDb()
  // The json-mode column serializes the (JSON-native) payload itself.
  const payload = data
  const expiresAt = expires ?? new Date(Date.now() + resolveSessionMaxAge() * 1000)
  // The `user_id` column is derived from the payload on every write: an
  // OTP-pending session carries only `pendingOtpUser` (NULL); once the
  // login completes the session is rewritten with `user` and the column
  // picks up the owner.
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
 * Resolve a session from the `X-Kobato-Session-Token` proxy-chain header
 * value — the raw signed `__session` cookie VALUE as the browser sent it
 * (percent-encoded). Core only reads this header behind a valid frontend
 * JWT (`frontendKeyAuth` in `http/orpc-base`), so anonymous requests can
 * never inject a session they do not own.
 */
export async function getSessionFromTokenHeader(headerValue: string): Promise<BlogSession> {
  return getSession(`${SESSION_COOKIE_NAME}=${headerValue}`)
}

/**
 * Construct a `BlogSession` with a pre-chosen sid. React Router's
 * `Session.id` is closed over at creation, so the login path must mint
 * the sid itself before doing session-row bookkeeping. `commitSession`
 * then writes the session row with the pre-chosen id intact.
 */
export function buildSessionWithSid(sid: string, data: BlogSessionData): BlogSession {
  return createSession<BlogSessionData, BlogSessionData>(data, sid)
}
