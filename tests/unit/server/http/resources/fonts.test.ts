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

describe('fontsRouter', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllGlobals()
    mockCsrf()
  })

  it('uploads a .ttf font for the og slot', async () => {
    vi.doMock('@/server/domains/audit/services/record', () => ({
      recordAuditEvent: vi.fn(),
    }))
    vi.doMock('@/server/infra/logger', () => ({
      getLogger: vi.fn(() => ({ info: vi.fn() })),
    }))
    vi.doMock('@/server/infra/paths', () => ({
      FONT_DIR: '/tmp/fonts',
    }))
    vi.doMock('@/server/render/og/assets', () => ({
      resetFontCache: vi.fn(),
    }))

    const fsMocks = {
      mkdir: vi.fn().mockResolvedValue(undefined),
      writeFile: vi.fn().mockResolvedValue(undefined),
    }
    vi.doMock('node:fs/promises', () => fsMocks)

    const { fontsRouter } = await import('@/server/http/resources/fonts')
    const app = createTestApp()
    app.route('/', fontsRouter)

    const form = new FormData()
    form.append('slot', 'og')
    form.append('file', new File(['fontdata'], 'font.ttf', { type: 'font/ttf' }))

    const res = await app.request('/api/admin/fonts/upload', {
      method: 'POST',
      body: form,
    })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ slot: 'og', size: 8 })
    expect(fsMocks.writeFile).toHaveBeenCalledWith('/tmp/fonts/og.ttf', Buffer.from('fontdata'))
  })

  it('rejects an unknown slot', async () => {
    const { fontsRouter } = await import('@/server/http/resources/fonts')
    const app = createTestApp()
    app.route('/', fontsRouter)

    const form = new FormData()
    form.append('slot', 'body')
    form.append('file', new File(['fontdata'], 'font.ttf', { type: 'font/ttf' }))

    const res = await app.request('/api/admin/fonts/upload', {
      method: 'POST',
      body: form,
    })
    expect(res.status).toBe(400)
  })

  it('rejects a non-ttf/otf file', async () => {
    const { fontsRouter } = await import('@/server/http/resources/fonts')
    const app = createTestApp()
    app.route('/', fontsRouter)

    const form = new FormData()
    form.append('slot', 'og')
    form.append('file', new File(['fontdata'], 'font.woff2', { type: 'font/woff2' }))

    const res = await app.request('/api/admin/fonts/upload', {
      method: 'POST',
      body: form,
    })
    expect(res.status).toBe(400)
  })

  it('rejects an empty file', async () => {
    const { fontsRouter } = await import('@/server/http/resources/fonts')
    const app = createTestApp()
    app.route('/', fontsRouter)

    const form = new FormData()
    form.append('slot', 'og')
    form.append('file', new File([], 'font.ttf', { type: 'font/ttf' }))

    const res = await app.request('/api/admin/fonts/upload', {
      method: 'POST',
      body: form,
    })
    expect(res.status).toBe(400)
  })
})
