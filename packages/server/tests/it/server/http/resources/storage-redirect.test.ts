import type { Env } from '@kobato/server/http/hono-env.ts'

import { __setStorageDirForTests } from '@kobato/server/infra/data-paths.ts'
import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '@kobato/server/tests/utils/blog-settings.ts'
import { makeRequestContext } from '@kobato/server/tests/utils/request-context.ts'
import { Hono } from 'hono'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const { localStorageRouter } = await import('@kobato/server/http/resources/local-storage.ts')

const app = new Hono<Env>()
app.use('*', async (c, next) => {
  c.set('requestContext', makeRequestContext({ request: c.req.raw }))
  await next()
})
app.route('/', localStorageRouter)

const root = mkdtempSync(join(tmpdir(), 'storage-redirect-it-'))
__setStorageDirForTests(root)

beforeAll(() => {
  mkdirSync(`${root}/images`, { recursive: true })
  writeFileSync(`${root}/images/a.jpg`, 'img-bytes')
})

afterAll(() => {
  __setStorageDirForTests(null)
  rmSync(root, { recursive: true, force: true })
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

    const overLimit = await app.request('/storage/images/a.jpg?w=4097&h=4096')
    expect(overLimit.headers.get('Location')).toBe('https://assets.example.com/images/a.jpg?w=4097&h=4096')

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
    const question = await app.request('/storage/images/a%3Fb.jpg?v=1')
    expect(question.status).toBe(302)
    expect(question.headers.get('Location')).toBe('https://assets.example.com/images/a%3Fb.jpg?v=1')

    const fragment = await app.request('/storage/images/a%23b.jpg')
    expect(fragment.headers.get('Location')).toBe('https://assets.example.com/images/a%23b.jpg')

    const space = await app.request('/storage/images/a%20b.jpg')
    expect(space.headers.get('Location')).toBe('https://assets.example.com/images/a%20b.jpg')

    const percent = await app.request('/storage/images/100%25.png')
    expect(percent.headers.get('Location')).toBe('https://assets.example.com/images/100%25.png')
  })

  it('keeps slashes as separators and still substitutes the encoded object URL into a template', async () => {
    withStorage({ urlTemplate: '{src}?q={quality}' })
    const res = await app.request('/storage/images/a%20b.jpg?w=640&h=360')
    expect(res.headers.get('Location')).toBe('https://assets.example.com/images/a%20b.jpg?q=100')
  })
})
