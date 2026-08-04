import type { Env } from '@kobato/server/http/context'

import { adminSession, adminUser } from '#/_helpers/session'

import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'

function createTestApp(session = adminSession()) {
  const app = new Hono<Env>()
  app.use('*', async (c, next) => {
    c.set('requestContext', { session, viewer: adminUser(), clientAddress: '127.0.0.1' } as never)
    await next()
  })
  return app
}

function mockCsrf() {
  vi.doMock('@kobato/server/http/middlewares/csrf', () => ({
    csrfGuard: async (_c: unknown, next: () => Promise<void>) => next(),
  }))
}

describe('maxmindRouter', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllGlobals()
    mockCsrf()
  })

  it('uploads and validates a .mmdb file', async () => {
    vi.doMock('@kobato/server/domains/analytics/geoip', () => ({
      resetGeoReader: vi.fn(),
    }))
    vi.doMock('@kobato/server/domains/audit/services/record', () => ({
      recordAuditEvent: vi.fn(),
      recordAuditEventFromContext: vi.fn(),
    }))
    vi.doMock('@kobato/server/infra/logger', () => ({
      getLogger: vi.fn(() => ({ info: vi.fn() })),
    }))
    vi.doMock('@kobato/server/infra/paths', () => ({
      MAXMIND_DB_PATH: '/tmp/maxmind/GeoLite2-City.mmdb',
      MAXMIND_META_PATH: '/tmp/maxmind/GeoLite2-City.meta.json',
    }))
    vi.doMock('@maxmind/geoip2-node', () => ({
      Reader: {
        open: vi.fn().mockResolvedValue({}),
      },
    }))

    const fsMocks = {
      mkdir: vi.fn().mockResolvedValue(undefined),
      writeFile: vi.fn().mockResolvedValue(undefined),
      rename: vi.fn().mockResolvedValue(undefined),
      unlink: vi.fn().mockResolvedValue(undefined),
    }
    vi.doMock('node:fs/promises', () => fsMocks)

    const { maxmindRouter } = await import('@kobato/server/http/resources/maxmind')
    const app = createTestApp()
    app.route('/', maxmindRouter)

    const form = new FormData()
    form.append('file', new File(['mmdb'], 'GeoLite2-City.mmdb', { type: 'application/octet-stream' }))

    const res = await app.request('/api/admin/maxmind/upload', {
      method: 'POST',
      body: form,
    })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ size: 4 })
    // Atomic swap: staged to a temp file, validated, then renamed into place.
    expect(fsMocks.writeFile).toHaveBeenCalledWith('/tmp/maxmind/GeoLite2-City.mmdb.upload', expect.any(Buffer))
    expect(fsMocks.rename).toHaveBeenCalledWith(
      '/tmp/maxmind/GeoLite2-City.mmdb.upload',
      '/tmp/maxmind/GeoLite2-City.mmdb',
    )
    // Provenance sidecar: marks the database as a manual upload so the
    // daily auto-update never replaces it silently.
    expect(fsMocks.writeFile).toHaveBeenCalledWith(
      '/tmp/maxmind/GeoLite2-City.meta.json',
      expect.stringContaining('"source":"upload"'),
    )
  })

  it('rejects non-mmdb files', async () => {
    vi.doMock('@kobato/server/infra/paths', () => ({
      MAXMIND_DB_PATH: '/tmp/maxmind/GeoLite2-City.mmdb',
      MAXMIND_META_PATH: '/tmp/maxmind/GeoLite2-City.meta.json',
    }))

    const { maxmindRouter } = await import('@kobato/server/http/resources/maxmind')
    const app = createTestApp()
    app.route('/', maxmindRouter)

    const form = new FormData()
    form.append('file', new File(['txt'], 'notes.txt', { type: 'text/plain' }))

    const res = await app.request('/api/admin/maxmind/upload', {
      method: 'POST',
      body: form,
    })
    expect(res.status).toBe(400)
  })

  it('rejects an empty file', async () => {
    vi.doMock('@kobato/server/infra/paths', () => ({
      MAXMIND_DB_PATH: '/tmp/maxmind/GeoLite2-City.mmdb',
      MAXMIND_META_PATH: '/tmp/maxmind/GeoLite2-City.meta.json',
    }))

    const { maxmindRouter } = await import('@kobato/server/http/resources/maxmind')
    const app = createTestApp()
    app.route('/', maxmindRouter)

    const form = new FormData()
    form.append('file', new File([], 'GeoLite2-City.mmdb', { type: 'application/octet-stream' }))

    const res = await app.request('/api/admin/maxmind/upload', {
      method: 'POST',
      body: form,
    })
    expect(res.status).toBe(400)
  })

  it('rejects a corrupt mmdb and never touches the live database', async () => {
    vi.doMock('@kobato/server/domains/analytics/geoip', () => ({
      resetGeoReader: vi.fn(),
    }))
    vi.doMock('@kobato/server/infra/logger', () => ({
      getLogger: vi.fn(() => ({ info: vi.fn() })),
    }))
    vi.doMock('@kobato/server/infra/paths', () => ({
      MAXMIND_DB_PATH: '/tmp/maxmind/GeoLite2-City.mmdb',
      MAXMIND_META_PATH: '/tmp/maxmind/GeoLite2-City.meta.json',
    }))
    vi.doMock('@maxmind/geoip2-node', () => ({
      Reader: {
        open: vi.fn().mockRejectedValue(new Error('invalid database')),
      },
    }))

    const unlink = vi.fn().mockResolvedValue(undefined)
    vi.doMock('node:fs/promises', () => ({
      mkdir: vi.fn().mockResolvedValue(undefined),
      writeFile: vi.fn().mockResolvedValue(undefined),
      unlink,
    }))

    const { maxmindRouter } = await import('@kobato/server/http/resources/maxmind')
    const app = createTestApp()
    app.route('/', maxmindRouter)

    const form = new FormData()
    form.append('file', new File(['bad'], 'GeoLite2-City.mmdb', { type: 'application/octet-stream' }))

    const res = await app.request('/api/admin/maxmind/upload', {
      method: 'POST',
      body: form,
    })
    expect(res.status).toBe(400)
    // Only the staged temp file is cleaned up — the live database is
    // never written before validation passes.
    expect(unlink).toHaveBeenCalledWith('/tmp/maxmind/GeoLite2-City.mmdb.upload')
  })

  it('rejects uploads that exceed the body limit', async () => {
    vi.doMock('@kobato/server/infra/paths', () => ({
      MAXMIND_DB_PATH: '/tmp/maxmind/GeoLite2-City.mmdb',
      MAXMIND_META_PATH: '/tmp/maxmind/GeoLite2-City.meta.json',
    }))

    const { maxmindRouter } = await import('@kobato/server/http/resources/maxmind')
    const app = createTestApp()
    app.route('/', maxmindRouter)

    const form = new FormData()
    form.append('file', new File(['x'], 'GeoLite2-City.mmdb', { type: 'application/octet-stream' }))

    const res = await app.request('/api/admin/maxmind/upload', {
      method: 'POST',
      body: form,
      headers: { 'Content-Length': String(101 * 1024 * 1024) },
    })
    expect(res.status).toBe(413)
    await expect(res.json()).resolves.toEqual({ error: { message: '上传文件过大' } })
  })
})
