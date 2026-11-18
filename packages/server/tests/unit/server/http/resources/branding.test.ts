import type { Env } from '@kobato/server/http/hono-env.ts'

import { adminSession, adminUser } from '@kobato/test/session.ts'
import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'

function createTestApp(session = adminSession()) {
  const app = new Hono<Env>()
  app.use('*', async (c, next) => {
    c.set('requestContext', { session, viewer: adminUser(), clientAddress: '127.0.0.1', db: {} } as never)
    await next()
  })
  return app
}

function mockCsrf() {
  vi.doMock('@kobato/server/http/middlewares/csrf.ts', () => ({
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
    vi.doMock('@kobato/server/domains/assets/management.ts', () => ({
      uploadBrandingAsset: vi.fn().mockResolvedValue('ref-123'),
      clearBrandingAsset: vi.fn(),
    }))
    vi.doMock('@kobato/server/domains/assets/services/storage.ts', () => ({
      isBrandingSlot: vi.fn((slot: string) => slot === 'logo'),
    }))
    vi.doMock('@kobato/server/domains/audit/services/record.ts', () => ({
      recordAuditEvent: vi.fn(),
      recordAuditEventFromContext: vi.fn(),
    }))
    vi.doMock('@kobato/server/infra/logger.ts', () => ({
      getLogger: vi.fn(() => ({ info: vi.fn() })),
    }))

    const { brandingRouter } = await import('@kobato/server/http/resources/branding.ts')
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
    vi.doMock('@kobato/server/domains/assets/management.ts', () => ({
      uploadBrandingAsset: vi.fn(),
      clearBrandingAsset: vi.fn(),
    }))
    vi.doMock('@kobato/server/domains/assets/services/storage.ts', () => ({
      isBrandingSlot: vi.fn().mockReturnValue(false),
    }))

    const { brandingRouter } = await import('@kobato/server/http/resources/branding.ts')
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
    vi.doMock('@kobato/server/domains/assets/management.ts', () => ({
      uploadBrandingAsset: vi.fn(),
      clearBrandingAsset: vi.fn(),
    }))
    vi.doMock('@kobato/server/domains/assets/services/storage.ts', () => ({
      isBrandingSlot: vi.fn().mockReturnValue(true),
    }))

    const { brandingRouter } = await import('@kobato/server/http/resources/branding.ts')
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
    vi.doMock('@kobato/server/domains/assets/management.ts', () => ({
      uploadBrandingAsset: vi.fn(),
      clearBrandingAsset: vi.fn().mockResolvedValue(undefined),
    }))
    vi.doMock('@kobato/server/domains/assets/services/storage.ts', () => ({
      isBrandingSlot: vi.fn((slot: string) => slot === 'logo'),
    }))
    vi.doMock('@kobato/server/domains/audit/services/record.ts', () => ({
      recordAuditEvent: vi.fn(),
      recordAuditEventFromContext: vi.fn(),
    }))
    vi.doMock('@kobato/server/infra/logger.ts', () => ({
      getLogger: vi.fn(() => ({ info: vi.fn() })),
    }))

    const { brandingRouter } = await import('@kobato/server/http/resources/branding.ts')
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
    vi.doMock('@kobato/server/domains/assets/management.ts', () => ({
      uploadBrandingAsset: vi.fn(),
      clearBrandingAsset: vi.fn(),
    }))
    vi.doMock('@kobato/server/domains/assets/services/storage.ts', () => ({
      isBrandingSlot: vi.fn().mockReturnValue(false),
    }))

    const { brandingRouter } = await import('@kobato/server/http/resources/branding.ts')
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
    vi.doMock('@kobato/server/domains/assets/management.ts', () => ({
      uploadBrandingAsset: vi.fn(),
      clearBrandingAsset: vi.fn(),
    }))
    vi.doMock('@kobato/server/domains/assets/services/storage.ts', () => ({
      isBrandingSlot: vi.fn().mockReturnValue(true),
    }))

    const { brandingRouter } = await import('@kobato/server/http/resources/branding.ts')
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
    await expect(res.json()).resolves.toMatchObject({
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: '上传文件过大',
        descriptor: { messageKey: 'common.error.uploadTooLarge' },
      },
    })
  })
})
