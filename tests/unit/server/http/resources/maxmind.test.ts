import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Env } from '@/server/http/context'

import { adminSession } from '#/_helpers/session'

function createTestApp(session = adminSession()) {
  const app = new Hono<Env>()
  app.use('*', async (c, next) => {
    c.set('session' as never, session as never)
    c.set('viewer' as never, { userId: '1', role: 'admin' } as never)
    c.set('clientAddress' as never, '127.0.0.1' as never)
    await next()
  })
  return app
}

function mockCsrf() {
  vi.doMock('@/server/http/middlewares/csrf', () => ({
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
    vi.doMock('@/server/domains/analytics/geoip', () => ({
      resetGeoReader: vi.fn(),
    }))
    vi.doMock('@/server/domains/audit/services/record', () => ({
      recordAuditEvent: vi.fn(),
    }))
    vi.doMock('@/server/infra/logger', () => ({
      getLogger: vi.fn(() => ({ info: vi.fn() })),
    }))
    vi.doMock('@/server/infra/paths', () => ({
      MAXMIND_DB_PATH: '/tmp/maxmind/GeoLite2-City.mmdb',
    }))
    vi.doMock('@maxmind/geoip2-node', () => ({
      Reader: {
        open: vi.fn().mockResolvedValue({}),
      },
    }))

    const fsMocks = {
      mkdir: vi.fn().mockResolvedValue(undefined),
      writeFile: vi.fn().mockResolvedValue(undefined),
      unlink: vi.fn().mockResolvedValue(undefined),
    }
    vi.doMock('node:fs/promises', () => fsMocks)

    const { maxmindRouter } = await import('@/server/http/resources/maxmind')
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
    expect(fsMocks.writeFile).toHaveBeenCalled()
  })

  it('rejects non-mmdb files', async () => {
    vi.doMock('@/server/infra/paths', () => ({
      MAXMIND_DB_PATH: '/tmp/maxmind/GeoLite2-City.mmdb',
    }))

    const { maxmindRouter } = await import('@/server/http/resources/maxmind')
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
    vi.doMock('@/server/infra/paths', () => ({
      MAXMIND_DB_PATH: '/tmp/maxmind/GeoLite2-City.mmdb',
    }))

    const { maxmindRouter } = await import('@/server/http/resources/maxmind')
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

  it('deletes corrupt mmdb files and returns 400', async () => {
    vi.doMock('@/server/domains/analytics/geoip', () => ({
      resetGeoReader: vi.fn(),
    }))
    vi.doMock('@/server/infra/logger', () => ({
      getLogger: vi.fn(() => ({ info: vi.fn() })),
    }))
    vi.doMock('@/server/infra/paths', () => ({
      MAXMIND_DB_PATH: '/tmp/maxmind/GeoLite2-City.mmdb',
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

    const { maxmindRouter } = await import('@/server/http/resources/maxmind')
    const app = createTestApp()
    app.route('/', maxmindRouter)

    const form = new FormData()
    form.append('file', new File(['bad'], 'GeoLite2-City.mmdb', { type: 'application/octet-stream' }))

    const res = await app.request('/api/admin/maxmind/upload', {
      method: 'POST',
      body: form,
    })
    expect(res.status).toBe(400)
    expect(unlink).toHaveBeenCalled()
  })

  it('rejects uploads that exceed the body limit', async () => {
    vi.doMock('@/server/infra/paths', () => ({
      MAXMIND_DB_PATH: '/tmp/maxmind/GeoLite2-City.mmdb',
    }))

    const { maxmindRouter } = await import('@/server/http/resources/maxmind')
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
