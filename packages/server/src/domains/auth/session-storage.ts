import type { Role } from '@kobato/auth/roles'
import type { Database } from '@kobato/db/sqlite/database'

import { deleteSessionById, readLiveSessionData, upsertSession } from '@kobato/db/sqlite/operations/identity/session'
import { serverConfig } from '@kobato/server/infra/config'
import { createSignedCookie } from '@kobato/server/infra/http/signed-cookie'
import { getLogger } from '@kobato/server/infra/logger'
import { getBlogSettingsBundleSync } from '@kobato/settings/getters'
import { idFromString } from '@kobato/utils/id'
import { isRecord } from '@kobato/utils/type-guards'
import { unsafeCast } from '@kobato/utils/unsafe-cast'

const log = getLogger('auth.session-storage')

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
  user?: SessionUser
  pendingOtpUser?: PendingOtpUser
  otpFailCount?: number
  csrfToken?: string
  absoluteExpiry?: number
  setupTokenVerified?: boolean
}

type BlogSessionValue = BlogSessionData[keyof BlogSessionData]

export interface BlogSession {
  readonly id: string
  readonly data: BlogSessionData
  get<Key extends keyof BlogSessionData>(name: Key): BlogSessionData[Key] | undefined
  set<Key extends keyof BlogSessionData>(name: Key, value: BlogSessionData[Key]): void
  unset(name: keyof BlogSessionData): void
}

function createBlogSession(initialData: BlogSessionData = {}, id = ''): BlogSession {
  const map = new Map<string, BlogSessionValue>(
    Object.entries(unsafeCast<Record<string, BlogSessionValue>>(initialData)),
  )
  return {
    get id() {
      return id
    },
    get data() {
      return unsafeCast<BlogSessionData>(Object.fromEntries(map))
    },
    get<Key extends keyof BlogSessionData>(name: Key): BlogSessionData[Key] | undefined {
      return unsafeCast<BlogSessionData[Key] | undefined>(map.get(name))
    },
    set<Key extends keyof BlogSessionData>(name: Key, value: BlogSessionData[Key]): void {
      map.set(name, value)
    },
    unset(name: keyof BlogSessionData): void {
      map.delete(name)
    },
  }
}

export const SESSION_MAX_AGE = 60 * 60 * 24 * 14

export const SESSION_COOKIE_NAME = '__session'

export function resolveSessionMaxAge(): number {
  const bundle = getBlogSettingsBundleSync()
  const configured = bundle?.limits?.sessionMaxAge
  return typeof configured === 'number' && configured > 0 ? configured : SESSION_MAX_AGE
}

const sessionCookie = createSignedCookie({
  name: SESSION_COOKIE_NAME,
  httpOnly: true,
  maxAge: SESSION_MAX_AGE,
  path: '/',
  sameSite: 'lax',
  secure: import.meta.env.PROD,
  secrets: serverConfig.security.sessionSecret,
})

async function writeSession(id: string, data: BlogSessionData, expires: Date | undefined): Promise<void> {
  const payload = data
  const expiresAt = expires ?? new Date(Date.now() + resolveSessionMaxAge() * 1000)
  const userId = data.user ? idFromString(data.user.id) : null
  await upsertSession(requireDb(), { id, userId, data: payload, expiresAt })
}

export async function getSession(cookieHeader: string | null): Promise<BlogSession> {
  const sid = await sessionCookie.parse(cookieHeader)
  if (sid === null) {
    return createBlogSession()
  }
  const data = await readLiveSessionData(requireDb(), sid)
  if (data === null) {
    return createBlogSession()
  }
  if (!isRecord(data)) {
    log.warn('session parse failed', { id: sid })
    return createBlogSession()
  }
  return createBlogSession(unsafeCast<BlogSessionData>(data), sid)
}

export async function commitSession(session: BlogSession, options?: { maxAge?: number }): Promise<string> {
  const maxAge = options?.maxAge ?? SESSION_MAX_AGE
  const expires = new Date(Date.now() + maxAge * 1000)
  const id = session.id || crypto.randomUUID()
  await writeSession(id, session.data, expires)
  return sessionCookie.serializeValue(id, maxAge)
}

export async function destroySession(session: BlogSession): Promise<string> {
  if (session.id) {
    await deleteSessionById(requireDb(), session.id)
  }
  return sessionCookie.serializeExpired()
}

export async function commitSessionWithMaxAge(session: BlogSession): Promise<string> {
  return commitSession(session, { maxAge: resolveSessionMaxAge() })
}

export async function getRequestSession(request: Request): Promise<BlogSession> {
  return getSession(request.headers.get('Cookie'))
}

export function buildSessionWithSid(sid: string, data: BlogSessionData): BlogSession {
  return createBlogSession(data, sid)
}
