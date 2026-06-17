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
    c.set('db' as never, {} as never)
    await next()
  })
  return app
}

function mockCsrf() {
  vi.doMock('@/server/http/middlewares/csrf', () => ({
    csrfGuard: async (_c: unknown, next: () => Promise<void>) => next(),
  }))
}

describe('brandingRouter', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllGlobals()
    mockCsrf()
  })

  it('uploads a valid branding asset', async () => {
    vi.doMock('@/server/domains/assets/management', () => ({
      isBrandingSlot: vi.fn((slot: string) => slot === 'logo'),
      uploadBrandingAsset: vi.fn().mockResolvedValue('ref-123'),
      clearBrandingAsset: vi.fn(),
    }))
    vi.doMock('@/server/domains/audit/services/record', () => ({
      recordAuditEvent: vi.fn(),
    }))
    vi.doMock('@/server/infra/logger', () => ({
      getLogger: vi.fn(() => ({ info: vi.fn() })),
    }))

    const { brandingRouter } = await import('@/server/http/resources/branding')
    const app = createTestApp()
    app.route('/', brandingRouter)

    const form = new FormData()
    form.append('slot', 'logo')
    form.append('file', new File(['bytes'], 'logo.svg', { type: 'image/svg+xml' }))

    const res = await app.request('/api/admin/branding/upload', {
      method: 'POST',
      body: form,
    })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ slot: 'logo', ref: 'ref-123' })
  })

  it('rejects upload with unknown slot', async () => {
    vi.doMock('@/server/domains/assets/management', () => ({
      isBrandingSlot: vi.fn().mockReturnValue(false),
      uploadBrandingAsset: vi.fn(),
      clearBrandingAsset: vi.fn(),
    }))

    const { brandingRouter } = await import('@/server/http/resources/branding')
    const app = createTestApp()
    app.route('/', brandingRouter)

    const form = new FormData()
    form.append('slot', 'nope')
    form.append('file', new File(['bytes'], 'logo.svg', { type: 'image/svg+xml' }))

    const res = await app.request('/api/admin/branding/upload', {
      method: 'POST',
      body: form,
    })
    expect(res.status).toBe(400)
  })

  it('rejects upload when file is missing', async () => {
    vi.doMock('@/server/domains/assets/management', () => ({
      isBrandingSlot: vi.fn().mockReturnValue(true),
      uploadBrandingAsset: vi.fn(),
      clearBrandingAsset: vi.fn(),
    }))

    const { brandingRouter } = await import('@/server/http/resources/branding')
    const app = createTestApp()
    app.route('/', brandingRouter)

    const form = new FormData()
    form.append('slot', 'logo')

    const res = await app.request('/api/admin/branding/upload', {
      method: 'POST',
      body: form,
    })
    expect(res.status).toBe(400)
  })

  it('clears a valid branding slot', async () => {
    vi.doMock('@/server/domains/assets/management', () => ({
      isBrandingSlot: vi.fn((slot: string) => slot === 'logo'),
      uploadBrandingAsset: vi.fn(),
      clearBrandingAsset: vi.fn().mockResolvedValue(undefined),
    }))
    vi.doMock('@/server/domains/audit/services/record', () => ({
      recordAuditEvent: vi.fn(),
    }))
    vi.doMock('@/server/infra/logger', () => ({
      getLogger: vi.fn(() => ({ info: vi.fn() })),
    }))

    const { brandingRouter } = await import('@/server/http/resources/branding')
    const app = createTestApp()
    app.route('/', brandingRouter)

    const res = await app.request('/api/admin/branding/clear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slot: 'logo' }),
    })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ slot: 'logo', success: true })
  })

  it('rejects clear with invalid slot', async () => {
    vi.doMock('@/server/domains/assets/management', () => ({
      isBrandingSlot: vi.fn().mockReturnValue(false),
      uploadBrandingAsset: vi.fn(),
      clearBrandingAsset: vi.fn(),
    }))

    const { brandingRouter } = await import('@/server/http/resources/branding')
    const app = createTestApp()
    app.route('/', brandingRouter)

    const res = await app.request('/api/admin/branding/clear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slot: 'nope' }),
    })
    expect(res.status).toBe(400)
  })

  it('rejects uploads that exceed the body limit', async () => {
    vi.doMock('@/server/domains/assets/management', () => ({
      isBrandingSlot: vi.fn().mockReturnValue(true),
      uploadBrandingAsset: vi.fn(),
      clearBrandingAsset: vi.fn(),
    }))

    const { brandingRouter } = await import('@/server/http/resources/branding')
    const app = createTestApp()
    app.route('/', brandingRouter)

    const form = new FormData()
    form.append('slot', 'logo')
    form.append('file', new File(['x'], 'logo.svg', { type: 'image/svg+xml' }))

    const res = await app.request('/api/admin/branding/upload', {
      method: 'POST',
      body: form,
      headers: { 'Content-Length': String(3 * 1024 * 1024) },
    })
    expect(res.status).toBe(413)
    await expect(res.json()).resolves.toEqual({ error: { message: '上传文件过大' } })
  })
})
