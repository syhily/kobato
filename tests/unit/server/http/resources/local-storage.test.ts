import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

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

// Seed one object per namespace we care about. The route's allowlist is what
// we're exercising, so each file's *contents* are irrelevant — only whether
// the key is reachable.
beforeAll(() => {
  mkdirSync(`${tmp.root}/images`, { recursive: true })
  mkdirSync(`${tmp.root}/musics`, { recursive: true })
  mkdirSync(`${tmp.root}/branding`, { recursive: true })
  mkdirSync(`${tmp.root}/backup`, { recursive: true })
  mkdirSync(`${tmp.root}/private`, { recursive: true })
  mkdirSync(`${tmp.root}/unknown`, { recursive: true })
  writeFileSync(`${tmp.root}/images/a.jpg`, 'img')
  writeFileSync(`${tmp.root}/musics/b.mp3`, 'aud')
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

describe('local-storage public route — namespace allowlist', () => {
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
