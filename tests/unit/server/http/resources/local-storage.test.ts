import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '#/_helpers/blog-settings'

// Point the route + `resolveLocalPath` at a fresh temp directory. The mock
// factory runs before any import of the route, so STORAGE_DIR is set first.
const tmp = vi.hoisted(() => ({ root: '' }))

vi.mock('@/server/infra/paths', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/infra/paths')>()
  const fs = await import('node:fs')
  const os = await import('node:os')
  const nodePath = await import('node:path')
  tmp.root = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'local-storage-route-'))
  return { ...actual, STORAGE_DIR: tmp.root }
})

const { localStorageRouter } = await import('@/server/http/resources/local-storage')

// The default test bundle enables a complete S3 config — override the toggle
// per suite: OFF streams local bytes, ON exercises the 302 branch.
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

// The allowlist is under test: file contents are irrelevant — only key reachability matters.
beforeAll(() => {
  mkdirSync(`${tmp.root}/images`, { recursive: true })
  mkdirSync(`${tmp.root}/musics`, { recursive: true })
  mkdirSync(`${tmp.root}/branding`, { recursive: true })
  mkdirSync(`${tmp.root}/backup`, { recursive: true })
  mkdirSync(`${tmp.root}/private`, { recursive: true })
  mkdirSync(`${tmp.root}/unknown`, { recursive: true })
  writeFileSync(`${tmp.root}/images/a.jpg`, 'img')
  writeFileSync(`${tmp.root}/musics/b.mp3`, 'aud')
  writeFileSync(`${tmp.root}/musics/t.flac`, 'flac')
  writeFileSync(`${tmp.root}/branding/c.svg`, '<svg/>')
  writeFileSync(`${tmp.root}/backup/backup-2026-01-01T00-00-00.sql.gz`, 'dump')
  writeFileSync(`${tmp.root}/private/secret.txt`, 'shh')
  writeFileSync(`${tmp.root}/.env`, 'SECRET=1')
  writeFileSync(`${tmp.root}/images/.hidden`, 'hid')
  writeFileSync(`${tmp.root}/unknown/x.txt`, 'x')
})

afterAll(() => {
  rmSync(tmp.root, { recursive: true, force: true })
})

describe('local-storage public route — namespace allowlist (local driver)', () => {
  // Streaming paths run with S3 OFF so the local driver owns the response.
  // beforeEach (not beforeAll): the shared setup resets the snapshot per test.
  beforeEach(() => {
    seedStorageEnabled(false)
  })

  it('serves allowlisted public namespaces', async () => {
    const img = await localStorageRouter.request('/storage/images/a.jpg')
    expect(img.status).toBe(200)
    expect(img.headers.get('Content-Type')).toBe('image/jpeg')

    const audio = await localStorageRouter.request('/storage/musics/b.mp3')
    expect(audio.status).toBe(200)
    expect(audio.headers.get('Content-Type')).toBe('audio/mpeg')

    const svg = await localStorageRouter.request('/storage/branding/c.svg')
    expect(svg.status).toBe(200)
    expect(svg.headers.get('Content-Type')).toBe('image/svg+xml')

    // Formerly served as octet-stream — the shared key-policy map closed the gap.
    const flac = await localStorageRouter.request('/storage/musics/t.flac')
    expect(flac.status).toBe(200)
    expect(flac.headers.get('Content-Type')).toBe('audio/flac')
  })

  it('refuses to serve a database backup (P0: no unauthenticated dump leak)', async () => {
    const res = await localStorageRouter.request('/storage/backup/backup-2026-01-01T00-00-00.sql.gz')
    expect(res.status).toBe(404)
    expect(await res.text()).toBe('')
  })

  it('refuses to serve any non-allowlisted / private namespace', async () => {
    const priv = await localStorageRouter.request('/storage/private/secret.txt')
    expect(priv.status).toBe(404)

    const unknown = await localStorageRouter.request('/storage/unknown/x.txt')
    expect(unknown.status).toBe(404)
  })

  it('refuses dotfiles and hidden segments even under an allowlisted namespace', async () => {
    const dotfile = await localStorageRouter.request('/storage/.env')
    expect(dotfile.status).toBe(404)

    const hidden = await localStorageRouter.request('/storage/images/.hidden')
    expect(hidden.status).toBe(404)
  })

  it('returns 404 for an empty key', async () => {
    const res = await localStorageRouter.request('/storage/')
    expect(res.status).toBe(404)
  })

  it('returns 200 with a range body for a valid single-range request', async () => {
    const res = await localStorageRouter.request('/storage/musics/b.mp3', {
      headers: { Range: 'bytes=0-1' },
    })
    expect(res.status).toBe(206)
    expect(res.headers.get('Content-Range')).toBe('bytes 0-1/3')
    expect(await res.text()).toBe('au')
  })
})

// Default bundle (S3 enabled + complete) drives the redirect branch.
describe('local-storage public route — s3 redirect', () => {
  it('302s an allowlisted key to the current public base, preserving the query string', async () => {
    const res = await localStorageRouter.request('/storage/images/a.jpg?v=123')
    expect(res.status).toBe(302)
    expect(res.headers.get('Location')).toBe('https://assets.example.com/images/a.jpg?v=123')
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=300')
    expect(await res.text()).toBe('')
  })

  it('keeps the namespace allowlist ahead of the redirect (private keys 404, never redirect)', async () => {
    const res = await localStorageRouter.request('/storage/backup/backup-2026-01-01T00-00-00.sql.gz?v=1')
    expect(res.status).toBe(404)
    expect(res.headers.get('Location')).toBeNull()
  })

  it('follows asset host updates immediately', async () => {
    seedStorageEnabled(true, 'cdn2.example.com')
    const res = await localStorageRouter.request('/storage/musics/b.mp3')
    expect(res.status).toBe(302)
    expect(res.headers.get('Location')).toBe('https://cdn2.example.com/musics/b.mp3')
  })

  it('answers 503 when S3 is active but the public base is unconfigured', async () => {
    seedStorageEnabled(true, '')
    const res = await localStorageRouter.request('/storage/images/a.jpg')
    expect(res.status).toBe(503)
  })
})
