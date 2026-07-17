import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Env } from '@/server/http/context'

import { adminSession } from '#/_helpers/session'

const mocks = vi.hoisted(() => ({
  recordAuditEvent: vi.fn(),
  info: vi.fn(),
}))

vi.mock('@/server/domains/audit/services/record', () => ({
  recordAuditEvent: mocks.recordAuditEvent,
}))

vi.mock('@/server/http/middlewares/csrf', () => ({
  csrfGuard: async (_c: unknown, next: () => Promise<void>) => next(),
}))

vi.mock('@/server/infra/logger', () => ({
  getLogger: vi.fn(() => ({ info: mocks.info })),
}))

const { adminUploadRoute } = await import('@/server/http/resources/admin-upload-route')

function createApp() {
  const app = new Hono<Env>()
  app.use('*', async (c, next) => {
    c.set('session', adminSession())
    c.set('clientAddress', '127.0.0.1')
    await next()
  })
  app.route(
    '/',
    adminUploadRoute({
      path: '/upload',
      maxSize: 1024,
      tooLargeMessage: 'too large',
      missingFileMessage: 'missing file',
      logScope: 'test.upload',
      logMessage: 'Uploaded test file',
      validateBody: (body, c) =>
        typeof body.kind === 'string' ? { value: body.kind } : c.json({ error: { message: 'missing kind' } }, 400),
      handler: async ({ c, file, validated: kind }) => ({
        response: c.json({ kind, size: file.size }),
        audit: { action: 'test_uploaded', resourceType: 'test', resourceId: kind },
        logContext: { kind, size: file.size },
      }),
    }),
  )
  return app
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('adminUploadRoute', () => {
  it('owns parsing, file validation, audit context, logging, and success response', async () => {
    const form = new FormData()
    form.append('kind', 'avatar')
    form.append('file', new File(['abc'], 'avatar.png'))

    const response = await createApp().request('/upload', {
      method: 'POST',
      headers: { 'User-Agent': 'test-agent' },
      body: form,
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ kind: 'avatar', size: 3 })
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith({
      action: 'test_uploaded',
      resourceType: 'test',
      resourceId: 'avatar',
      actorId: '1',
      actorRole: 'admin',
      ipAddress: '127.0.0.1',
      userAgent: 'test-agent',
    })
    expect(mocks.info).toHaveBeenCalledWith('Uploaded test file', { kind: 'avatar', size: 3 })
  })

  it('preserves route-specific validation before the shared missing-file response', async () => {
    const invalid = await createApp().request('/upload', { method: 'POST', body: new FormData() })
    expect(invalid.status).toBe(400)
    await expect(invalid.json()).resolves.toEqual({ error: { message: 'missing kind' } })

    const valid = new FormData()
    valid.append('kind', 'avatar')
    const missingFile = await createApp().request('/upload', { method: 'POST', body: valid })
    expect(missingFile.status).toBe(400)
    await expect(missingFile.json()).resolves.toEqual({ error: { message: 'missing file' } })
  })
})
