import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// Point the route + `resolveLocalPath` at a fresh temp directory. The mock
// factory runs before any import of the route, so STORAGE_DIR is set first.
const tmp = vi.hoisted(() => ({ root: '' }))

vi.mock('@kobato/server/infra/paths', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@kobato/server/infra/paths')>()
  const fs = await import('node:fs')
  const os = await import('node:os')
  const nodePath = await import('node:path')
  tmp.root = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'fonts-embedded-route-'))
  return { ...actual, STORAGE_DIR: tmp.root }
})

const { fontsEmbeddedRouter } = await import('@kobato/server/http/resources/fonts-embedded')

// Any 64-char lowercase hex string satisfies the route's sha256 shape check.
const HASH = 'a'.repeat(64)
const MISSING_HASH = 'b'.repeat(64)

// Seed one package under the storage `fonts/` namespace. File contents are
// irrelevant — what matters is which URL shapes reach the filesystem.
beforeAll(() => {
  mkdirSync(`${tmp.root}/fonts/${HASH}`, { recursive: true })
  writeFileSync(`${tmp.root}/fonts/${HASH}/result.css`, '@font-face{}')
  writeFileSync(`${tmp.root}/fonts/${HASH}/chunk-001.woff2`, 'woff2-bytes')
  writeFileSync(`${tmp.root}/fonts/${HASH}/.secret.woff2`, 'hid')
})

afterAll(() => {
  rmSync(tmp.root, { recursive: true, force: true })
})

describe('fonts-embedded public route', () => {
  it('serves a published font package file', async () => {
    const css = await fontsEmbeddedRouter.request(`/fonts/embedded/${HASH}/result.css`)
    expect(css.status).toBe(200)
    expect(css.headers.get('Content-Type')).toBe('text/css; charset=utf-8')

    const woff2 = await fontsEmbeddedRouter.request(`/fonts/embedded/${HASH}/chunk-001.woff2`)
    expect(woff2.status).toBe(200)
    expect(woff2.headers.get('Content-Type')).toBe('font/woff2')
  })

  it('rejects a hash that is not exactly 64 lowercase hex chars', async () => {
    const short = await fontsEmbeddedRouter.request('/fonts/embedded/abc123/result.css')
    expect(short.status).toBe(400)

    const upper = await fontsEmbeddedRouter.request(`/fonts/embedded/${'A'.repeat(64)}/result.css`)
    expect(upper.status).toBe(400)
  })

  it('rejects dotfiles and hidden segments under a valid hash', async () => {
    const dotfile = await fontsEmbeddedRouter.request(`/fonts/embedded/${HASH}/.secret.woff2`)
    expect(dotfile.status).toBe(400)

    const hidden = await fontsEmbeddedRouter.request(`/fonts/embedded/${HASH}/sub/.hidden/x.woff2`)
    expect(hidden.status).toBe(400)
  })

  it('returns 404 for a well-formed hash with no package on disk', async () => {
    const res = await fontsEmbeddedRouter.request(`/fonts/embedded/${MISSING_HASH}/result.css`)
    expect(res.status).toBe(404)
  })

  it('returns 206 with a range body for a valid single-range request', async () => {
    const res = await fontsEmbeddedRouter.request(`/fonts/embedded/${HASH}/chunk-001.woff2`, {
      headers: { Range: 'bytes=0-4' },
    })
    expect(res.status).toBe(206)
    expect(res.headers.get('Content-Range')).toBe('bytes 0-4/11')
    expect(await res.text()).toBe('woff2')
  })
})
