import type { Env } from '@kobato/server/http/hono-env'

import { serializeKobatoRpcInput } from '@kobato/api/client/rpc-serialization'
import { unsafeCast } from '@kobato/base/utils/unsafe-cast'
import { ensureCsrfToken } from '@kobato/server/domains/auth/csrf'
import { createApiApp } from '@kobato/server/http/app'
import { MAXMIND_DB_PATH, MAXMIND_META_PATH } from '@kobato/server/infra/data-paths'
import { minimalMmdbBytes } from '@kobato/server/tests/utils/minimal-mmdb'
import { makeRequestContext } from '@kobato/server/tests/utils/request-context'
import { adminSession } from '@kobato/server/tests/utils/session'
import { Hono } from 'hono'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname } from 'node:path'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

const MMDB = minimalMmdbBytes()

function createApp() {
  const session = adminSession()
  const app = new Hono<Env>()
  app.use('*', async (c, next) => {
    c.set('requestContext', makeRequestContext({ session }))
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
  return createApiApp()
}

describe('maxmindRouter', () => {
  it('uploads and validates a real .mmdb file through the maxmind reader', async () => {
    const { app, csrf } = createApp()
    app.route('/', await makeRouter())

    const body = unsafeCast<BodyInit>(
      serializeKobatoRpcInput({
        file: new File([new Uint8Array(MMDB)], 'GeoLite2-City.mmdb', { type: 'application/octet-stream' }),
      }),
    )
    const res = await app.request('/rpc/admin/geoip/upload', { method: 'POST', body, headers: csrf })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ json: { size: MMDB.length } })
    expect(readFileSync(MAXMIND_DB_PATH).equals(MMDB)).toBe(true)
    expect(existsSync(`${MAXMIND_DB_PATH}.upload`)).toBe(false)
    expect(readFileSync(MAXMIND_META_PATH, 'utf8')).toContain('"source":"upload"')
  })

  it('rejects non-mmdb files', async () => {
    const { app, csrf } = createApp()
    app.route('/', await makeRouter())

    const form = new FormData()
    form.append('file', new File(['txt'], 'notes.txt', { type: 'text/plain' }))

    const res = await app.request('/rpc/admin/geoip/upload', { method: 'POST', body: form, headers: csrf })
    expect(res.status).toBe(400)
  })

  it('rejects an empty file', async () => {
    const { app, csrf } = createApp()
    app.route('/', await makeRouter())

    const form = new FormData()
    form.append('file', new File([], 'GeoLite2-City.mmdb', { type: 'application/octet-stream' }))

    const res = await app.request('/rpc/admin/geoip/upload', { method: 'POST', body: form, headers: csrf })
    expect(res.status).toBe(400)
  })

  it('rejects a corrupt mmdb, cleans the staged upload, and never touches the live database', async () => {
    const { app, csrf } = createApp()
    app.route('/', await makeRouter())

    const form = new FormData()
    form.append('file', new File(['bad'], 'GeoLite2-City.mmdb', { type: 'application/octet-stream' }))

    const res = await app.request('/rpc/admin/geoip/upload', { method: 'POST', body: form, headers: csrf })
    expect(res.status).toBe(400)
    expect(existsSync(`${MAXMIND_DB_PATH}.upload`)).toBe(false)
    expect(existsSync(MAXMIND_DB_PATH)).toBe(false)
  })

  it('rejects uploads that exceed the body limit', async () => {
    const { app, csrf } = createApp()
    app.route('/', await makeRouter())

    const form = new FormData()
    form.append('file', new File(['x'], 'GeoLite2-City.mmdb', { type: 'application/octet-stream' }))

    const res = await app.request('/rpc/admin/geoip/upload', {
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
