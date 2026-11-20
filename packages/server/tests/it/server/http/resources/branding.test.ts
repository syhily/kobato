import type { Env } from '@kobato/server/http/hono-env.ts'

import { upsertSetting } from '@kobato/db/operations/setting.ts'
import { ensureCsrfToken } from '@kobato/server/domains/auth/csrf.ts'
import { __resetStorageBackendsForTests, __setStorageBackendForTests } from '@kobato/server/infra/storage/registry.ts'
import { clearAllTables, getTestDb } from '@kobato/server/tests/utils/integration-db.ts'
import { makeMemoryBackend } from '@kobato/server/tests/utils/memory-storage.ts'
import { adminSession, adminUser } from '@kobato/server/tests/utils/session.ts'
import { SECTION_REGISTRY } from '@kobato/settings/sections/registry.ts'
import { Hono } from 'hono'
import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const mem = makeMemoryBackend()
const db = getTestDb()

const SVG_BYTES = '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>'
const ASSETS_SCOPE = SECTION_REGISTRY.assets.scope

function seedAssetsRow(branding?: Record<string, unknown>): void {
  const base = {
    asset: { host: 'cdn.example.com', scheme: 'https' },
    storage: {
      enabled: true,
      endpoint: 'https://s3.example.com',
      region: 'auto',
      bucket: 'b',
      accessKeyId: 'k',
      secretAccessKey: 's',
      forcePathStyle: false,
      urlTemplate: '',
    },
    upload: { maxBytes: 8 * 1024 * 1024, jpegQuality: 82 },
  }
  upsertSetting(db, branding === undefined ? base : { ...base, branding }, null, ASSETS_SCOPE)
}

function createApp() {
  const session = adminSession()
  const app = new Hono<Env>()
  app.use('*', async (c, next) => {
    c.set('requestContext', {
      session,
      viewer: adminUser(),
      clientAddress: '127.0.0.1',
      requestFacts: { userAgent: 'vitest' },
      db,
    } as never)
    await next()
  })
  return { app, csrf: { 'x-csrf-token': ensureCsrfToken(session) } }
}

beforeEach(async () => {
  __setStorageBackendForTests('s3', mem.backend)
  await clearAllTables(db)
  seedAssetsRow()
})

afterEach(async () => {
  __resetStorageBackendsForTests()
  mem.reset()
})

describe('brandingRouter', () => {
  it('uploads a valid branding asset', async () => {
    const { app, csrf } = createApp()
    const { brandingRouter } = await import('@kobato/server/http/resources/branding.ts')
    app.route('/', brandingRouter)

    const form = new FormData()
    form.append('slot', 'logoSvg')
    form.append('file', new File([SVG_BYTES], 'logo.svg', { type: 'image/svg+xml' }))

    const res = await app.request('/api/admin/branding/upload', { method: 'POST', body: form, headers: csrf })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { slot: string; ref: { etag: string } }
    expect(body.slot).toBe('logoSvg')
    expect(body.ref.etag).toBe(createHash('sha256').update(SVG_BYTES, 'utf8').digest('hex'))
    expect(mem.store.size).toBe(1)
    expect([...mem.store.values()][0]!.body.toString('utf8')).toBe(SVG_BYTES)
  })

  it('rejects upload with unknown slot', async () => {
    const { app, csrf } = createApp()
    const { brandingRouter } = await import('@kobato/server/http/resources/branding.ts')
    app.route('/', brandingRouter)

    const form = new FormData()
    form.append('slot', 'nope')
    form.append('file', new File([SVG_BYTES], 'logo.svg', { type: 'image/svg+xml' }))

    const res = await app.request('/api/admin/branding/upload', { method: 'POST', body: form, headers: csrf })
    expect(res.status).toBe(400)
  })

  it('rejects upload when file is missing', async () => {
    const { app, csrf } = createApp()
    const { brandingRouter } = await import('@kobato/server/http/resources/branding.ts')
    app.route('/', brandingRouter)

    const form = new FormData()
    form.append('slot', 'logoSvg')

    const res = await app.request('/api/admin/branding/upload', { method: 'POST', body: form, headers: csrf })
    expect(res.status).toBe(400)
  })

  it('clears a valid branding slot', async () => {
    const { app, csrf } = createApp()
    const { brandingRouter } = await import('@kobato/server/http/resources/branding.ts')
    app.route('/', brandingRouter)

    const res = await app.request('/api/admin/branding/clear', {
      method: 'POST',
      headers: { ...csrf, 'Content-Type': 'application/json' },
      body: JSON.stringify({ slot: 'logoSvg' }),
    })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ slot: 'logoSvg', success: true })
  })

  it('rejects clear with invalid slot', async () => {
    const { app, csrf } = createApp()
    const { brandingRouter } = await import('@kobato/server/http/resources/branding.ts')
    app.route('/', brandingRouter)

    const res = await app.request('/api/admin/branding/clear', {
      method: 'POST',
      headers: { ...csrf, 'Content-Type': 'application/json' },
      body: JSON.stringify({ slot: 'nope' }),
    })
    expect(res.status).toBe(400)
  })

  it('rejects uploads that exceed the body limit', async () => {
    const { app, csrf } = createApp()
    const { brandingRouter } = await import('@kobato/server/http/resources/branding.ts')
    app.route('/', brandingRouter)

    const form = new FormData()
    form.append('slot', 'logoSvg')
    form.append('file', new File(['x'], 'logo.svg', { type: 'image/svg+xml' }))

    const res = await app.request('/api/admin/branding/upload', {
      method: 'POST',
      body: form,
      headers: { ...csrf, 'Content-Length': String(3 * 1024 * 1024) },
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
