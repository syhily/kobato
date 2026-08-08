import type { Session } from 'react-router'

import { and, eq, gt } from 'drizzle-orm'
import { createSession, createSessionStorage } from 'react-router'

import type { Database } from '@/server/infra/db/database'
import type { Role } from '@/shared/utils/roles'

import { serverConfig } from '@/server/infra/config'
import { session as sessionTable } from '@/server/infra/db/schema/session'
import { getLogger } from '@/server/infra/logger'
import { getBlogSettingsBundleSync } from '@/shared/config/getters'
import { idFromString } from '@/shared/utils/id'
import { isRecord } from '@/shared/utils/type-guards'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

const log = getLogger('auth.session-storage')

// DB handle injected by the composition root (a direct import would
// invert the dependency direction); an unwired call fails loudly
// instead of degrading.
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
  role: Role
}

export interface PendingOtpUser {
  userId: string
  email: string
  expiresAt: number
  sentAt: number
}

export interface BlogSessionData {
  // Invariant: `user` present ⇒ `user.role` non-null — the only writer
  // is `establishLoginSession`, which throws on `!dbUser.role`.
  user?: SessionUser
  pendingOtpUser?: PendingOtpUser
  otpFailCount?: number
  csrfToken?: string
  // Absolute expiry: invalid after this timestamp regardless of cookie refreshes.
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
    secrets: serverConfig.security.sessionSecret,
  },
  async createData(data, expires) {
    const id = crypto.randomUUID()
    await writeSession(id, data, expires)
    return id
  },
  async readData(id) {
    // Expired rows read as misses; the hourly sweep deletes them lazily.
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
      // `data` is plain JSON (all strings/numbers/booleans); non-object reads as a miss.
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
  // `user_id` derives from the payload on every write: OTP-pending
  // sessions carry only `pendingOtpUser` → NULL.
  const userId = data.user ? idFromString(data.user.id) : null
  await db
    .insert(sessionTable)
    .values({ id, userId, data: payload, expiresAt })
    .onConflictDoUpdate({
      target: sessionTable.id,
      // Never touch the meta columns — owned by `repo.ts::recordSessionLogin`.
      set: { userId, data: payload, expiresAt },
    })
}

export const { getSession, commitSession, destroySession } = storage

export async function getRequestSession(request: Request): Promise<BlogSession> {
  return getSession(request.headers.get('Cookie'))
}

/**
 * Build a session with a pre-chosen sid — React Router closes over the
 * id at creation, so the login path mints it before row bookkeeping.
 */
export function buildSessionWithSid(sid: string, data: BlogSessionData): BlogSession {
  return createSession<BlogSessionData, BlogSessionData>(data, sid)
}
