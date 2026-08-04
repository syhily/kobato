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

describe('fontsRouter', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllGlobals()
    mockCsrf()
  })

  it('uploads a .ttf font for the og slot', async () => {
    vi.doMock('@kobato/server/domains/audit/services/record', () => ({
      recordAuditEvent: vi.fn(),
      recordAuditEventFromContext: vi.fn(),
    }))
    vi.doMock('@kobato/server/infra/logger', () => ({
      getLogger: vi.fn(() => ({ info: vi.fn() })),
    }))
    vi.doMock('@kobato/server/infra/paths', () => ({
      FONT_DIR: '/tmp/fonts',
    }))
    vi.doMock('@kobato/server/render/canvas-fonts', () => ({
      resetFontCache: vi.fn(),
      resetCanvasFont: vi.fn(),
    }))

    const fsMocks = {
      mkdir: vi.fn().mockResolvedValue(undefined),
      writeFile: vi.fn().mockResolvedValue(undefined),
    }
    vi.doMock('node:fs/promises', () => fsMocks)

    const { fontsRouter } = await import('@kobato/server/http/resources/fonts')
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

  it('invalidates the canvas font slot on upload — the next ensureCanvasFont re-reads', async () => {
    // Use the REAL canvas-fonts module here: the point of this test is the
    // upload → invalidation → re-read chain, so only its leaf
    // dependencies (settings, fs, the native font registry) are mocked.
    const families = { og: 'OPPO Sans', calendar: '' }
    const fsMocks = {
      mkdir: vi.fn().mockResolvedValue(undefined),
      writeFile: vi.fn().mockResolvedValue(undefined),
      access: vi.fn().mockResolvedValue(undefined),
      readFile: vi.fn().mockResolvedValue(Buffer.from('ttf-v1')),
    }
    const registered = new Set<string>()
    // `vi.doMock` registrations are file-scoped: undo the partial assets
    // mock from the first test so the real module loads below.
    vi.doUnmock('@kobato/server/render/canvas-fonts')
    vi.doMock('@kobato/server/domains/audit/services/record', () => ({
      recordAuditEvent: vi.fn(),
      recordAuditEventFromContext: vi.fn(),
    }))
    vi.doMock('@kobato/server/infra/logger', () => ({
      getLogger: vi.fn(() => ({ info: vi.fn(), warn: vi.fn() })),
    }))
    vi.doMock('@kobato/server/infra/paths', () => ({
      FONT_DIR: '/tmp/fonts',
    }))
    vi.doMock('node:fs/promises', () => fsMocks)
    vi.doMock('@napi-rs/canvas', () => ({
      GlobalFonts: {
        has: (family: string) => registered.has(family),
        register: (_buffer: Buffer, family: string) => void registered.add(family),
      },
    }))
    vi.doMock('@kobato/shared/config/getters', () => ({
      requireBlogSettingsSection: vi.fn((section: string) => {
        if (section === 'fonts') {
          return {
            og: { family: families.og },
            calendar: { family: families.calendar },
          }
        }
        throw new Error(`unexpected settings section: ${section}`)
      }),
    }))

    const { fontsRouter } = await import('@kobato/server/http/resources/fonts')
    const { ensureCanvasFont } = await import('@kobato/server/render/canvas-fonts')
    const app = createTestApp()
    app.route('/', fontsRouter)

    // Warm the slot: the first render registers the family.
    const first = await ensureCanvasFont('og')
    expect(first?.family).toBe('OPPO Sans')
    expect(fsMocks.readFile).toHaveBeenCalledTimes(1)

    // Sanity: without an upload, the fast path serves the cached slot.
    await ensureCanvasFont('og')
    expect(fsMocks.readFile).toHaveBeenCalledTimes(1)

    const form = new FormData()
    form.append('slot', 'og')
    form.append('file', new File(['ttf-v2'], 'font.ttf', { type: 'font/ttf' }))
    const res = await app.request('/api/admin/fonts/upload', {
      method: 'POST',
      body: form,
    })
    expect(res.status).toBe(200)

    // The very next render re-reads the file — no process restart needed.
    fsMocks.readFile.mockResolvedValue(Buffer.from('ttf-v2'))
    const second = await ensureCanvasFont('og')
    expect(fsMocks.readFile).toHaveBeenCalledTimes(2)
    expect(second?.family).toBe('OPPO Sans')
    expect(second?.buffer).toEqual(Buffer.from('ttf-v2'))
  })

  it('rejects an unknown slot', async () => {
    const { fontsRouter } = await import('@kobato/server/http/resources/fonts')
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
    const { fontsRouter } = await import('@kobato/server/http/resources/fonts')
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
    const { fontsRouter } = await import('@kobato/server/http/resources/fonts')
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
