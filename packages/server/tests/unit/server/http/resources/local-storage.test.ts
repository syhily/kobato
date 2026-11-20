import type { Env } from '@kobato/server/http/hono-env.ts'

import { __setStorageDirForTests } from '@kobato/server/infra/data-paths.ts'
import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '@kobato/server/tests/utils/blog-settings.ts'
import { makeRequestContext } from '@kobato/server/tests/utils/request-context.ts'
import { Hono } from 'hono'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const { localStorageRouter } = await import('@kobato/server/http/resources/local-storage.ts')

const app = new Hono<Env>()
app.use('*', async (c, next) => {
  c.set('requestContext', makeRequestContext({ request: c.req.raw }))
  await next()
})
app.route('/', localStorageRouter)

function seedStorageEnabled(enabled: boolean, assetHost = 'assets.example.com') {
  setBlogSettingsBundleForTests({
    ...TEST_BLOG_SETTINGS_BUNDLE,
    assets: {
      ...TEST_BLOG_SETTINGS_BUNDLE.assets!,
      asset: { scheme: 'https', host: assetHost },
      storage: { ...TEST_BLOG_SETTINGS_BUNDLE.assets!.storage, enabled },
    },
  })
}

const root = mkdtempSync(join(tmpdir(), 'local-storage-route-'))
__setStorageDirForTests(root)

beforeAll(() => {
  mkdirSync(`${root}/images`, { recursive: true })
  mkdirSync(`${root}/musics`, { recursive: true })
  mkdirSync(`${root}/branding`, { recursive: true })
  mkdirSync(`${root}/backup`, { recursive: true })
  mkdirSync(`${root}/private`, { recursive: true })
  mkdirSync(`${root}/unknown`, { recursive: true })
  writeFileSync(`${root}/images/a.jpg`, 'img')
  writeFileSync(`${root}/musics/b.mp3`, 'aud')
  writeFileSync(`${root}/musics/t.flac`, 'flac')
  writeFileSync(`${root}/branding/c.svg`, '<svg/>')
  writeFileSync(`${root}/backup/backup-2026-01-01T00-00-00.sql.gz`, 'dump')
  writeFileSync(`${root}/private/secret.txt`, 'shh')
  writeFileSync(`${root}/.env`, 'SECRET=1')
  writeFileSync(`${root}/images/.hidden`, 'hid')
  writeFileSync(`${root}/unknown/x.txt`, 'x')
})

afterAll(() => {
  __setStorageDirForTests(null)
  rmSync(root, { recursive: true, force: true })
})

describe('local-storage public route — namespace allowlist (local driver)', () => {
  beforeEach(() => {
    seedStorageEnabled(false)
  })

  it('serves allowlisted public namespaces', async () => {
    const img = await app.request('/storage/images/a.jpg')
    expect(img.status).toBe(200)
    expect(img.headers.get('Content-Type')).toBe('image/jpeg')

    const audio = await app.request('/storage/musics/b.mp3')
    expect(audio.status).toBe(200)
    expect(audio.headers.get('Content-Type')).toBe('audio/mpeg')

    const svg = await app.request('/storage/branding/c.svg')
    expect(svg.status).toBe(200)
    expect(svg.headers.get('Content-Type')).toBe('image/svg+xml')

    const flac = await app.request('/storage/musics/t.flac')
    expect(flac.status).toBe(200)
    expect(flac.headers.get('Content-Type')).toBe('audio/flac')
  })

  it('refuses to serve a database backup (P0: no unauthenticated dump leak)', async () => {
    const res = await app.request('/storage/backup/backup-2026-01-01T00-00-00.sql.gz')
    expect(res.status).toBe(404)
    expect(await res.text()).toBe('')
  })

  it('refuses to serve any non-allowlisted / private namespace', async () => {
    const priv = await app.request('/storage/private/secret.txt')
    expect(priv.status).toBe(404)

    const unknown = await app.request('/storage/unknown/x.txt')
    expect(unknown.status).toBe(404)
  })

  it('refuses dotfiles and hidden segments even under an allowlisted namespace', async () => {
    const dotfile = await app.request('/storage/.env')
    expect(dotfile.status).toBe(404)

    const hidden = await app.request('/storage/images/.hidden')
    expect(hidden.status).toBe(404)
  })

  it('returns 404 for an empty key', async () => {
    const res = await app.request('/storage/')
    expect(res.status).toBe(404)
  })

  it('returns 200 with a range body for a valid single-range request', async () => {
    const res = await app.request('/storage/musics/b.mp3', {
      headers: { Range: 'bytes=0-1' },
    })
    expect(res.status).toBe(206)
    expect(res.headers.get('Content-Range')).toBe('bytes 0-1/3')
    expect(await res.text()).toBe('au')
  })
})

describe('local-storage public route — s3 redirect', () => {
  it('302s an allowlisted key to the current public base, preserving the query string', async () => {
    const res = await app.request('/storage/images/a.jpg?v=123')
    expect(res.status).toBe(302)
    expect(res.headers.get('Location')).toBe('https://assets.example.com/images/a.jpg?v=123')
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=300')
    expect(await res.text()).toBe('')
  })

  it('keeps the namespace allowlist ahead of the redirect (private keys 404, never redirect)', async () => {
    const res = await app.request('/storage/backup/backup-2026-01-01T00-00-00.sql.gz?v=1')
    expect(res.status).toBe(404)
    expect(res.headers.get('Location')).toBeNull()
  })

  it('follows asset host updates immediately', async () => {
    seedStorageEnabled(true, 'cdn2.example.com')
    const res = await app.request('/storage/musics/b.mp3')
    expect(res.status).toBe(302)
    expect(res.headers.get('Location')).toBe('https://cdn2.example.com/musics/b.mp3')
  })

  it('answers 503 when S3 is active but the public base is unconfigured', async () => {
    seedStorageEnabled(true, '')
    const res = await app.request('/storage/images/a.jpg')
    expect(res.status).toBe(503)
  })
})
