import type { Env } from '@kobato/server/http/hono-env.ts'

import { __setStorageDirForTests } from '@kobato/server/infra/data-paths.ts'
import { makeRequestContext } from '@kobato/server/tests/utils/request-context.ts'
import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '@kobato/settings/tests/utils/blog-settings.ts'
import { Hono } from 'hono'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const { fontsEmbeddedRouter } = await import('@kobato/server/http/resources/fonts-embedded.ts')

const app = new Hono<Env>()
app.use('*', async (c, next) => {
  c.set('requestContext', makeRequestContext({ request: c.req.raw }))
  await next()
})
app.route('/', fontsEmbeddedRouter)

function seedStorageEnabled(enabled: boolean) {
  setBlogSettingsBundleForTests({
    ...TEST_BLOG_SETTINGS_BUNDLE,
    assets: {
      ...TEST_BLOG_SETTINGS_BUNDLE.assets!,
      storage: { ...TEST_BLOG_SETTINGS_BUNDLE.assets!.storage, enabled },
    },
  })
}

const HASH = 'a'.repeat(64)
const MISSING_HASH = 'b'.repeat(64)

const root = mkdtempSync(join(tmpdir(), 'fonts-embedded-route-'))
__setStorageDirForTests(root)

beforeAll(() => {
  mkdirSync(`${root}/fonts/${HASH}`, { recursive: true })
  writeFileSync(`${root}/fonts/${HASH}/result.css`, '@font-face{}')
  writeFileSync(`${root}/fonts/${HASH}/chunk-001.woff2`, 'woff2-bytes')
  writeFileSync(`${root}/fonts/${HASH}/.secret.woff2`, 'hid')
})

afterAll(() => {
  __setStorageDirForTests(null)
  rmSync(root, { recursive: true, force: true })
})

describe('fonts-embedded public route (local driver)', () => {
  beforeEach(() => {
    seedStorageEnabled(false)
  })

  it('serves a published font package file', async () => {
    const css = await app.request(`/fonts/embedded/${HASH}/result.css`)
    expect(css.status).toBe(200)
    expect(css.headers.get('Content-Type')).toBe('text/css; charset=utf-8')

    const woff2 = await app.request(`/fonts/embedded/${HASH}/chunk-001.woff2`)
    expect(woff2.status).toBe(200)
    expect(woff2.headers.get('Content-Type')).toBe('font/woff2')
  })

  it('rejects a hash that is not exactly 64 lowercase hex chars', async () => {
    const short = await app.request('/fonts/embedded/abc123/result.css')
    expect(short.status).toBe(400)

    const upper = await app.request(`/fonts/embedded/${'A'.repeat(64)}/result.css`)
    expect(upper.status).toBe(400)
  })

  it('rejects dotfiles and hidden segments under a valid hash', async () => {
    const dotfile = await app.request(`/fonts/embedded/${HASH}/.secret.woff2`)
    expect(dotfile.status).toBe(400)

    const hidden = await app.request(`/fonts/embedded/${HASH}/sub/.hidden/x.woff2`)
    expect(hidden.status).toBe(400)
  })

  it('returns 404 for a well-formed hash with no package on disk', async () => {
    const res = await app.request(`/fonts/embedded/${MISSING_HASH}/result.css`)
    expect(res.status).toBe(404)
  })

  it('returns 206 with a range body for a valid single-range request', async () => {
    const res = await app.request(`/fonts/embedded/${HASH}/chunk-001.woff2`, {
      headers: { Range: 'bytes=0-4' },
    })
    expect(res.status).toBe(206)
    expect(res.headers.get('Content-Range')).toBe('bytes 0-4/11')
    expect(await res.text()).toBe('woff2')
  })
})

describe('fonts-embedded public route — s3 redirect', () => {
  it('302s to the raw storage key on the current public base, preserving the query string', async () => {
    const res = await app.request(`/fonts/embedded/${HASH}/result.css?v=3735928559`)
    expect(res.status).toBe(302)
    expect(res.headers.get('Location')).toBe(`https://assets.example.com/fonts/${HASH}/result.css?v=3735928559`)
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=300')
  })

  it('keeps the path-shape gate ahead of the redirect (malformed paths 400, never redirect)', async () => {
    const res = await app.request('/fonts/embedded/abc123/result.css')
    expect(res.status).toBe(400)
    expect(res.headers.get('Location')).toBeNull()
  })
})
