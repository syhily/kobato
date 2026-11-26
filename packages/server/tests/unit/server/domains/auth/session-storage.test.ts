import type { Database } from '@kobato/db/sqlite/database'
import type { BlogSessionData } from '@kobato/server/domains/auth/session-storage'

import {
  buildSessionWithSid,
  commitSession,
  destroySession,
  getSession,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE,
  wireSessionStorageDb,
} from '@kobato/server/domains/auth/session-storage'
import { serverConfig } from '@kobato/server/infra/config'
import { createCookie, createSessionStorage, type Cookie } from 'react-router'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const rows = vi.hoisted(() => new Map<string, { data: unknown; expires: Date | undefined }>())

vi.mock('@kobato/db/sqlite/operations/identity/session', () => ({
  readLiveSessionData: async (_db: unknown, id: string) => {
    const row = rows.get(id)
    if (!row || (row.expires !== undefined && row.expires.getTime() <= Date.now())) {
      return null
    }
    return row.data
  },
  upsertSession: async (_db: unknown, values: { id: string; data: unknown; expiresAt: Date }) => {
    rows.set(values.id, { data: values.data, expires: values.expiresAt })
  },
  deleteSessionById: async (_db: unknown, id: string) => {
    rows.delete(id)
  },
}))

beforeAll(() => {
  wireSessionStorageDb({ getDb: () => ({}) as Database })
})

beforeEach(() => {
  rows.clear()
})

function cookiePair(setCookie: string): string {
  return setCookie.split(';')[0]!
}

function createOracleCookie(): Cookie {
  return createCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    maxAge: SESSION_MAX_AGE,
    path: '/',
    sameSite: 'lax',
    secure: import.meta.env.PROD,
    secrets: serverConfig.security.sessionSecret,
  })
}

function createOracleStorage() {
  return createSessionStorage<BlogSessionData>({
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
      rows.set(id, { data, expires })
      return id
    },
    async readData(id) {
      return (rows.get(id)?.data ?? null) as BlogSessionData | null
    },
    async updateData(id, data, expires) {
      rows.set(id, { data, expires })
    },
    async deleteData(id) {
      rows.delete(id)
    },
  })
}

describe('BlogSession container', () => {
  it('exposes the sid and initial data', () => {
    const session = buildSessionWithSid('sid-1', { csrfToken: 'tok', otpFailCount: 2 })
    expect(session.id).toBe('sid-1')
    expect(session.get('csrfToken')).toBe('tok')
    expect(session.get('otpFailCount')).toBe(2)
    expect(session.get('user')).toBeUndefined()
    expect(session.data).toEqual({ csrfToken: 'tok', otpFailCount: 2 })
  })

  it('reflects set/unset in later reads and the data snapshot', () => {
    const session = buildSessionWithSid('sid-2', {})
    session.set('csrfToken', 'fresh')
    expect(session.get('csrfToken')).toBe('fresh')
    expect(session.data).toEqual({ csrfToken: 'fresh' })
    session.unset('csrfToken')
    expect(session.get('csrfToken')).toBeUndefined()
    expect(session.data).toEqual({})
  })

  it('returns an isolated snapshot from data', () => {
    const session = buildSessionWithSid('sid-3', { csrfToken: 'tok' })
    const snapshot = session.data
    snapshot.csrfToken = 'mutated'
    expect(session.get('csrfToken')).toBe('tok')
  })
})

describe('getSession', () => {
  it('returns a fresh empty session without a cookie header', async () => {
    const session = await getSession(null)
    expect(session.id).toBe('')
    expect(session.data).toEqual({})
  })

  it('returns a fresh empty session for an unsigned or malformed cookie', async () => {
    for (const header of [`${SESSION_COOKIE_NAME}=garbage`, `${SESSION_COOKIE_NAME}=!!!.@@@`, 'other=1']) {
      const session = await getSession(header)
      expect(session.id).toBe('')
      expect(session.data).toEqual({})
    }
  })

  it('loads the row for a validly signed sid', async () => {
    const setCookie = await commitSession(buildSessionWithSid('sid-live', {}))
    rows.set('sid-live', { data: { csrfToken: 'live-tok' }, expires: new Date(Date.now() + 60_000) })
    const session = await getSession(cookiePair(setCookie))
    expect(session.id).toBe('sid-live')
    expect(session.get('csrfToken')).toBe('live-tok')
  })

  it('rejects a non-record payload and starts fresh', async () => {
    const setCookie = await commitSession(buildSessionWithSid('sid-weird', {}))
    rows.set('sid-weird', { data: 'not-a-record', expires: new Date(Date.now() + 60_000) })
    const session = await getSession(cookiePair(setCookie))
    expect(session.id).toBe('')
    expect(session.data).toEqual({})
  })

  it('does not resurrect a signed sid whose row is gone; the next commit mints a new id', async () => {
    const setCookie = await commitSession(buildSessionWithSid('sid-stale', { csrfToken: 'x' }))
    rows.delete('sid-stale')

    const session = await getSession(cookiePair(setCookie))
    expect(session.id).toBe('')
    expect(session.data).toEqual({})

    const recommitted = await commitSession(session)
    const minted = [...rows.keys()]
    expect(minted).toHaveLength(1)
    expect(minted[0]).not.toBe('sid-stale')
    expect(minted[0]).toMatch(/^[0-9a-f]{8}-[0-9a-f-]{27}$/)

    const reparsed = await getSession(cookiePair(recommitted))
    expect(reparsed.id).toBe(minted[0])
  })

  it('treats an expired row as absent', async () => {
    const setCookie = await commitSession(buildSessionWithSid('sid-expired', {}))
    rows.set('sid-expired', { data: { csrfToken: 'old' }, expires: new Date(Date.now() - 1000) })
    const session = await getSession(cookiePair(setCookie))
    expect(session.id).toBe('')
    expect(session.data).toEqual({})
  })
})

describe('commitSession', () => {
  it('mints a UUID for an id-less session and issues a parseable cookie', async () => {
    const session = buildSessionWithSid('', { csrfToken: 'tok' })
    const setCookie = await commitSession(session)
    expect(setCookie).toMatch(new RegExp(`^${SESSION_COOKIE_NAME}=`))
    expect(setCookie).toContain(`Max-Age=${SESSION_MAX_AGE}`)
    expect(setCookie).toContain('Path=/')
    expect(setCookie).toContain('HttpOnly')
    expect(setCookie).toContain('SameSite=Lax')

    const minted = [...rows.keys()]
    expect(minted).toHaveLength(1)
    expect(minted[0]).toMatch(/^[0-9a-f]{8}-[0-9a-f-]{27}$/)
    expect(rows.get(minted[0]!)?.data).toEqual({ csrfToken: 'tok' })

    const reparsed = await getSession(cookiePair(setCookie))
    expect(reparsed.id).toBe(minted[0])
    expect(reparsed.get('csrfToken')).toBe('tok')
  })

  it('updates the existing row for an id-ed session', async () => {
    rows.set('sid-keep', { data: {}, expires: new Date(Date.now() + 60_000) })
    const setCookie = await commitSession(buildSessionWithSid('sid-keep', { csrfToken: 'rotated' }))
    expect(rows.get('sid-keep')?.data).toEqual({ csrfToken: 'rotated' })
    const reparsed = await getSession(cookiePair(setCookie))
    expect(reparsed.id).toBe('sid-keep')
  })

  it('derives the row expiry and the cookie Max-Age from the maxAge option', async () => {
    const before = Date.now()
    const setCookie = await commitSession(buildSessionWithSid('sid-maxage', {}), { maxAge: 3600 })
    expect(setCookie).toContain('Max-Age=3600')
    const expires = rows.get('sid-maxage')?.expires
    expect(expires).toBeDefined()
    expect(expires!.getTime()).toBeGreaterThanOrEqual(before + 3600 * 1000)
    expect(expires!.getTime()).toBeLessThan(Date.now() + 3600 * 1000 + 1000)
  })
})

describe('destroySession', () => {
  it('deletes the row and returns an already-expired cookie', async () => {
    rows.set('sid-gone', { data: {}, expires: new Date(Date.now() + 60_000) })
    const setCookie = await destroySession(buildSessionWithSid('sid-gone', {}))
    expect(rows.has('sid-gone')).toBe(false)
    expect(setCookie).toMatch(new RegExp(`^${SESSION_COOKIE_NAME}=;`))
    expect(setCookie).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT')
    expect(setCookie).not.toContain('Max-Age')
  })

  it('skips the delete for an id-less session', async () => {
    const setCookie = await destroySession(buildSessionWithSid('', {}))
    expect(setCookie).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT')
  })
})

describe('react-router session storage wire compatibility', () => {
  it('commits a byte-identical cookie to the react-router implementation for the same sid and data', async () => {
    const oracle = createOracleStorage()
    const oracleSession = await oracle.getSession(cookiePair(await createOracleCookie().serialize('sid-fixed')))
    oracleSession.set('csrfToken', 'tok')
    const oracleSetCookie = await oracle.commitSession(oracleSession)

    const mineSetCookie = await commitSession(buildSessionWithSid('sid-fixed', { csrfToken: 'tok' }))
    expect(mineSetCookie).toBe(oracleSetCookie)
    expect(rows.get('sid-fixed')?.data).toEqual({ csrfToken: 'tok' })
  })

  it('commits a byte-identical cookie under a maxAge override', async () => {
    const oracle = createOracleStorage()
    const oracleSession = await oracle.getSession(cookiePair(await createOracleCookie().serialize('sid-fixed')))
    const oracleSetCookie = await oracle.commitSession(oracleSession, { maxAge: 3600 })

    const mineSetCookie = await commitSession(buildSessionWithSid('sid-fixed', {}), { maxAge: 3600 })
    expect(mineSetCookie).toBe(oracleSetCookie)
  })

  it('destroys to a byte-identical expired cookie', async () => {
    const oracle = createOracleStorage()
    const oracleSession = await oracle.getSession(cookiePair(await createOracleCookie().serialize('sid-gone')))
    rows.set('sid-gone', { data: {}, expires: new Date(Date.now() + 60_000) })
    const oracleSetCookie = await oracle.destroySession(oracleSession)

    rows.set('sid-gone', { data: {}, expires: new Date(Date.now() + 60_000) })
    const mineSetCookie = await destroySession(buildSessionWithSid('sid-gone', {}))
    expect(mineSetCookie).toBe(oracleSetCookie)
    expect(rows.has('sid-gone')).toBe(false)
  })

  it('reads a cookie committed by the react-router implementation', async () => {
    const oracle = createOracleStorage()
    const oracleSession = await oracle.getSession(null)
    oracleSession.set('csrfToken', 'oracle-tok')
    const setCookie = await oracle.commitSession(oracleSession)
    const minted = [...rows.keys()]
    expect(minted).toHaveLength(1)

    const restored = await getSession(cookiePair(setCookie))
    expect(restored.id).toBe(minted[0])
    expect(restored.get('csrfToken')).toBe('oracle-tok')
  })

  it('issues cookies the react-router implementation resolves to the same sid', async () => {
    const session = await getSession(null)
    session.set('csrfToken', 'mine-tok')
    const setCookie = await commitSession(session)
    const minted = [...rows.keys()][0]!

    const oracle = createOracleStorage()
    const restored = await oracle.getSession(cookiePair(setCookie))
    expect(restored.id).toBe(minted)
    expect(restored.get('csrfToken')).toBe('mine-tok')
  })
})
