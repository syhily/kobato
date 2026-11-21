import type { Env } from '@kobato/server/http/hono-env'

import { ensureCsrfToken } from '@kobato/server/domains/auth/csrf'
import { FONT_DIR } from '@kobato/server/infra/data-paths'
import { resetFontCache } from '@kobato/server/render/canvas-fonts'
import { adminSession, adminUser } from '@kobato/server/tests/utils/session'
import { setBlogSettingsBundleForTests, TEST_BLOG_SETTINGS_BUNDLE } from '@kobato/settings/tests/utils/blog-settings'
import { Hono } from 'hono'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

const REAL_TTF = readFileSync(join(dirname(import.meta.filename), '../../../../fixtures/fonts/Barlow-Regular.ttf'))
const OG_FONT_PATH = join(FONT_DIR, 'og.ttf')

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
  resetFontCache()
  mkdirSync(FONT_DIR, { recursive: true })
  rmSync(OG_FONT_PATH, { force: true })
  setBlogSettingsBundleForTests({
    ...TEST_BLOG_SETTINGS_BUNDLE,
    fonts: { ...TEST_BLOG_SETTINGS_BUNDLE.fonts, og: { family: 'OPPO Sans' } },
  } as typeof TEST_BLOG_SETTINGS_BUNDLE)
})

afterAll(() => {
  rmSync(OG_FONT_PATH, { force: true })
})

async function makeRouter() {
  const { fontsRouter } = await import('@kobato/server/http/resources/fonts')
  return fontsRouter
}

describe('fontsRouter', () => {
  it('uploads a .ttf font for the og slot', async () => {
    const { app, csrf } = createApp()
    app.route('/', await makeRouter())

    const form = new FormData()
    form.append('slot', 'og')
    form.append('file', new File([REAL_TTF], 'font.ttf', { type: 'font/ttf' }))

    const res = await app.request('/api/admin/fonts/upload', { method: 'POST', body: form, headers: csrf })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ slot: 'og', size: REAL_TTF.length })
    expect(readFileSync(OG_FONT_PATH).equals(REAL_TTF)).toBe(true)
  })

  it('invalidates the canvas font slot on upload — the next ensureCanvasFont re-reads', async () => {
    const { app, csrf } = createApp()
    app.route('/', await makeRouter())
    writeFileSync(OG_FONT_PATH, REAL_TTF)
    const { ensureCanvasFont } = await import('@kobato/server/render/canvas-fonts')

    const first = await ensureCanvasFont('og')
    expect(first?.family).toBe('OPPO Sans')
    expect(first?.buffer.equals(REAL_TTF)).toBe(true)

    const cached = await ensureCanvasFont('og')
    expect(cached).toBe(first)

    const form = new FormData()
    form.append('slot', 'og')
    form.append('file', new File([REAL_TTF], 'font.ttf', { type: 'font/ttf' }))
    const res = await app.request('/api/admin/fonts/upload', { method: 'POST', body: form, headers: csrf })
    expect(res.status).toBe(200)

    const second = await ensureCanvasFont('og')
    expect(second).not.toBe(first)
    expect(second?.family).toBe('OPPO Sans')
    expect(second?.buffer.equals(REAL_TTF)).toBe(true)
  })

  it('rejects an unknown slot', async () => {
    const { app, csrf } = createApp()
    app.route('/', await makeRouter())

    const form = new FormData()
    form.append('slot', 'body')
    form.append('file', new File(['fontdata'], 'font.ttf', { type: 'font/ttf' }))

    const res = await app.request('/api/admin/fonts/upload', { method: 'POST', body: form, headers: csrf })
    expect(res.status).toBe(400)
  })

  it('rejects a non-ttf/otf file', async () => {
    const { app, csrf } = createApp()
    app.route('/', await makeRouter())

    const form = new FormData()
    form.append('slot', 'og')
    form.append('file', new File(['fontdata'], 'font.woff2', { type: 'font/woff2' }))

    const res = await app.request('/api/admin/fonts/upload', { method: 'POST', body: form, headers: csrf })
    expect(res.status).toBe(400)
  })

  it('rejects an empty file', async () => {
    const { app, csrf } = createApp()
    app.route('/', await makeRouter())

    const form = new FormData()
    form.append('slot', 'og')
    form.append('file', new File([], 'font.ttf', { type: 'font/ttf' }))

    const res = await app.request('/api/admin/fonts/upload', { method: 'POST', body: form, headers: csrf })
    expect(res.status).toBe(400)
  })
})
