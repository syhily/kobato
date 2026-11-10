import { Hono } from 'hono'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import type { Env } from '@/server/http/context'

import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '#/_helpers/blog-settings'
import { makeRequestContext } from '#/_helpers/request-context'

// Router-level end-to-end against the REAL settings snapshot (the it harness
// hydrates the default bundle: S3 enabled + complete) — no module mocks of
// the storage registry. Only the local STORAGE_DIR is redirected to a temp
// root so the streaming branch has real bytes to serve.
const tmp = vi.hoisted(() => ({ root: '' }))

vi.mock('@/server/infra/paths', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/infra/paths')>()
  const fs = await import('node:fs')
  const os = await import('node:os')
  const nodePath = await import('node:path')
  tmp.root = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'storage-redirect-it-'))
  return { ...actual, STORAGE_DIR: tmp.root }
})

const { localStorageRouter } = await import('@/server/http/resources/local-storage')

// The real route reads the perimeter-derived `requestContext` (locale for the
// 503 branch); a direct `router.request` has no middleware chain, so mirror the
// production perimeter with the canonical stub.
const app = new Hono<Env>()
app.use('*', async (c, next) => {
  c.set('requestContext', makeRequestContext({ request: c.req.raw }))
  await next()
})
app.route('/', localStorageRouter)

beforeAll(() => {
  mkdirSync(`${tmp.root}/images`, { recursive: true })
  writeFileSync(`${tmp.root}/images/a.jpg`, 'img-bytes')
})

afterAll(() => {
  rmSync(tmp.root, { recursive: true, force: true })
})

describe('storage redirect — site-owned /storage/* URLs', () => {
  const assets = TEST_BLOG_SETTINGS_BUNDLE.assets!

  function withStorage(storage: Partial<typeof assets.storage>): void {
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      assets: { ...assets, storage: { ...assets.storage, ...storage } },
    })
  }

  it('302s to the current public base when S3 is enabled, preserving the ?v= query', async () => {
    const res = await app.request('/storage/images/a.jpg?v=123')
    expect(res.status).toBe(302)
    expect(res.headers.get('Location')).toBe('https://assets.example.com/images/a.jpg?v=123')
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=300')
  })

  it('substitutes w/h/q into a {src} template and preserves other params', async () => {
    withStorage({ urlTemplate: 'https://cdn.transform.com/{src}?w={width}&h={height}&q={quality}' })
    const res = await app.request('/storage/images/a.jpg?w=300&h=150&q=75&v=123')
    expect(res.status).toBe(302)
    expect(res.headers.get('Location')).toBe(
      'https://cdn.transform.com/https://assets.example.com/images/a.jpg?w=300&h=150&q=75&v=123',
    )
  })

  it('appends a template without {src} to the object URL', async () => {
    withStorage({ urlTemplate: '!{width}x{height}' })
    const res = await app.request('/storage/images/a.jpg?w=300&h=150&v=123')
    expect(res.headers.get('Location')).toBe('https://assets.example.com/images/a.jpg!300x150?v=123')
  })

  it('defaults an absent q to the historical 100 and consumes it', async () => {
    withStorage({ urlTemplate: '{src}?q={quality}' })
    const res = await app.request('/storage/images/a.jpg?w=640&h=360&v=1')
    expect(res.headers.get('Location')).toBe('https://assets.example.com/images/a.jpg?q=100&v=1')
  })

  it('ignores the template when only w is present (h missing)', async () => {
    withStorage({ urlTemplate: '!{width}x{height}' })
    const res = await app.request('/storage/images/a.jpg?w=300&v=123')
    expect(res.headers.get('Location')).toBe('https://assets.example.com/images/a.jpg?w=300&v=123')
  })

  it('ignores the template on malformed transform params', async () => {
    withStorage({ urlTemplate: '!{width}x{height}' })
    const res = await app.request('/storage/images/a.jpg?w=abc&h=150&v=123')
    expect(res.headers.get('Location')).toBe('https://assets.example.com/images/a.jpg?w=abc&h=150&v=123')
  })

  it('clamps dimensions: 4096 is substituted, 4097 is ignored', async () => {
    withStorage({ urlTemplate: '!{width}x{height}' })
    const atLimit = await app.request('/storage/images/a.jpg?w=4096&h=4096')
    expect(atLimit.headers.get('Location')).toBe('https://assets.example.com/images/a.jpg!4096x4096')

    // Out of range → no transform; the query string rides along untouched.
    const overLimit = await app.request('/storage/images/a.jpg?w=4097&h=4096')
    expect(overLimit.headers.get('Location')).toBe('https://assets.example.com/images/a.jpg?w=4097&h=4096')

    // Leading zeros can't smuggle a zero dimension past the floor.
    const zero = await app.request('/storage/images/a.jpg?w=0000&h=4096')
    expect(zero.headers.get('Location')).toBe('https://assets.example.com/images/a.jpg?w=0000&h=4096')
  })

  it('clamps quality: out-of-range q falls back to the default 100', async () => {
    withStorage({ urlTemplate: '{src}?q={quality}' })
    const tooHigh = await app.request('/storage/images/a.jpg?w=640&h=360&q=101')
    expect(tooHigh.headers.get('Location')).toBe('https://assets.example.com/images/a.jpg?q=100')

    const atLimit = await app.request('/storage/images/a.jpg?w=640&h=360&q=100')
    expect(atLimit.headers.get('Location')).toBe('https://assets.example.com/images/a.jpg?q=100')

    const zero = await app.request('/storage/images/a.jpg?w=640&h=360&q=0')
    expect(zero.headers.get('Location')).toBe('https://assets.example.com/images/a.jpg?q=100')
  })

  it('still streams local bytes when S3 is disabled', async () => {
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      assets: {
        ...TEST_BLOG_SETTINGS_BUNDLE.assets!,
        storage: { ...TEST_BLOG_SETTINGS_BUNDLE.assets!.storage, enabled: false },
      },
    })
    const res = await app.request('/storage/images/a.jpg?v=123')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/jpeg')
    expect(await res.text()).toBe('img-bytes')
  })

  it('re-encodes reserved characters of the decoded key for the Location header', async () => {
    withStorage({ urlTemplate: '' })
    // The route decodes before the allowlist check; `?`, `#`, and space all pass
    // it (no empty/dot segments under an allowlisted prefix), but raw in the
    // Location they would truncate or break the CDN object URL — send them
    // percent-encoded.
    const question = await app.request('/storage/images/a%3Fb.jpg?v=1')
    expect(question.status).toBe(302)
    expect(question.headers.get('Location')).toBe('https://assets.example.com/images/a%3Fb.jpg?v=1')

    const fragment = await app.request('/storage/images/a%23b.jpg')
    expect(fragment.headers.get('Location')).toBe('https://assets.example.com/images/a%23b.jpg')

    const space = await app.request('/storage/images/a%20b.jpg')
    expect(space.headers.get('Location')).toBe('https://assets.example.com/images/a%20b.jpg')

    // A literal `%` (decoded from `%25`) must not become a broken escape.
    const percent = await app.request('/storage/images/100%25.png')
    expect(percent.headers.get('Location')).toBe('https://assets.example.com/images/100%25.png')
  })

  it('keeps slashes as separators and still substitutes the encoded object URL into a template', async () => {
    withStorage({ urlTemplate: '{src}?q={quality}' })
    const res = await app.request('/storage/images/a%20b.jpg?w=640&h=360')
    expect(res.headers.get('Location')).toBe('https://assets.example.com/images/a%20b.jpg?q=100')
  })
})
