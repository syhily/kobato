import type { Env } from '@kobato/server/http/hono-env.ts'

import { ensureCsrfToken } from '@kobato/server/domains/auth/csrf.ts'
import { MAXMIND_DB_PATH, MAXMIND_META_PATH } from '@kobato/server/infra/data-paths.ts'
import { minimalMmdbBytes } from '@kobato/server/tests/utils/minimal-mmdb.ts'
import { adminSession, adminUser } from '@kobato/server/tests/utils/session.ts'
import { Hono } from 'hono'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname } from 'node:path'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

const MMDB = minimalMmdbBytes()

function createApp() {
  const session = adminSession()
  const app = new Hono<Env>()
  app.use('*', async (c, next) => {
    c.set('requestContext', {
      session,
      viewer: adminUser(),
      clientAddress: '127.0.0.1',
      requestFacts: { userAgent: 'vitest' },
    } as never)
    await next()
  })
  return { app, csrf: { 'x-csrf-token': ensureCsrfToken(session) } }
}

beforeEach(() => {
  mkdirSync(dirname(MAXMIND_DB_PATH), { recursive: true })
  rmSync(MAXMIND_DB_PATH, { force: true })
  rmSync(`${MAXMIND_DB_PATH}.upload`, { force: true })
  rmSync(MAXMIND_META_PATH, { force: true })
})

afterAll(() => {
  rmSync(MAXMIND_DB_PATH, { force: true })
  rmSync(`${MAXMIND_DB_PATH}.upload`, { force: true })
  rmSync(MAXMIND_META_PATH, { force: true })
})

async function makeRouter() {
  const { maxmindRouter } = await import('@kobato/server/http/resources/maxmind.ts')
  return maxmindRouter
}

describe('maxmindRouter', () => {
  it('uploads and validates a real .mmdb file through the maxmind reader', async () => {
    const { app, csrf } = createApp()
    app.route('/', await makeRouter())

    const form = new FormData()
    form.append('file', new File([new Uint8Array(MMDB)], 'GeoLite2-City.mmdb', { type: 'application/octet-stream' }))

    const res = await app.request('/api/admin/maxmind/upload', { method: 'POST', body: form, headers: csrf })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ size: MMDB.length })
    expect(readFileSync(MAXMIND_DB_PATH).equals(MMDB)).toBe(true)
    expect(existsSync(`${MAXMIND_DB_PATH}.upload`)).toBe(false)
    expect(readFileSync(MAXMIND_META_PATH, 'utf8')).toContain('"source":"upload"')
  })

  it('rejects non-mmdb files', async () => {
    const { app, csrf } = createApp()
    app.route('/', await makeRouter())

    const form = new FormData()
    form.append('file', new File(['txt'], 'notes.txt', { type: 'text/plain' }))

    const res = await app.request('/api/admin/maxmind/upload', { method: 'POST', body: form, headers: csrf })
    expect(res.status).toBe(400)
  })

  it('rejects an empty file', async () => {
    const { app, csrf } = createApp()
    app.route('/', await makeRouter())

    const form = new FormData()
    form.append('file', new File([], 'GeoLite2-City.mmdb', { type: 'application/octet-stream' }))

    const res = await app.request('/api/admin/maxmind/upload', { method: 'POST', body: form, headers: csrf })
    expect(res.status).toBe(400)
  })

  it('rejects a corrupt mmdb, cleans the staged upload, and never touches the live database', async () => {
    const { app, csrf } = createApp()
    app.route('/', await makeRouter())

    const form = new FormData()
    form.append('file', new File(['bad'], 'GeoLite2-City.mmdb', { type: 'application/octet-stream' }))

    const res = await app.request('/api/admin/maxmind/upload', { method: 'POST', body: form, headers: csrf })
    expect(res.status).toBe(400)
    expect(existsSync(`${MAXMIND_DB_PATH}.upload`)).toBe(false)
    expect(existsSync(MAXMIND_DB_PATH)).toBe(false)
  })

  it('rejects uploads that exceed the body limit', async () => {
    const { app, csrf } = createApp()
    app.route('/', await makeRouter())

    const form = new FormData()
    form.append('file', new File(['x'], 'GeoLite2-City.mmdb', { type: 'application/octet-stream' }))

    const res = await app.request('/api/admin/maxmind/upload', {
      method: 'POST',
      body: form,
      headers: { ...csrf, 'Content-Length': String(101 * 1024 * 1024) },
    })
    expect(res.status).toBe(413)
    await expect(res.json()).resolves.toMatchObject({
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: '上传文件过大',
        descriptor: { messageKey: 'common.error.uploadTooLarge' },
      },
    })
  })
})
