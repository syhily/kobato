import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '#/_helpers/blog-settings'

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
    const res = await localStorageRouter.request('/storage/images/a.jpg?v=123')
    expect(res.status).toBe(302)
    expect(res.headers.get('Location')).toBe('https://assets.example.com/images/a.jpg?v=123')
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=300')
  })

  it('substitutes w/h/q into a {src} template and preserves other params', async () => {
    withStorage({ urlTemplate: 'https://cdn.transform.com/{src}?w={width}&h={height}&q={quality}' })
    const res = await localStorageRouter.request('/storage/images/a.jpg?w=300&h=150&q=75&v=123')
    expect(res.status).toBe(302)
    expect(res.headers.get('Location')).toBe(
      'https://cdn.transform.com/https://assets.example.com/images/a.jpg?w=300&h=150&q=75&v=123',
    )
  })

  it('appends a template without {src} to the object URL', async () => {
    withStorage({ urlTemplate: '!{width}x{height}' })
    const res = await localStorageRouter.request('/storage/images/a.jpg?w=300&h=150&v=123')
    expect(res.headers.get('Location')).toBe('https://assets.example.com/images/a.jpg!300x150?v=123')
  })

  it('defaults an absent q to the historical 100 and consumes it', async () => {
    withStorage({ urlTemplate: '{src}?q={quality}' })
    const res = await localStorageRouter.request('/storage/images/a.jpg?w=640&h=360&v=1')
    expect(res.headers.get('Location')).toBe('https://assets.example.com/images/a.jpg?q=100&v=1')
  })

  it('ignores the template when only w is present (h missing)', async () => {
    withStorage({ urlTemplate: '!{width}x{height}' })
    const res = await localStorageRouter.request('/storage/images/a.jpg?w=300&v=123')
    expect(res.headers.get('Location')).toBe('https://assets.example.com/images/a.jpg?w=300&v=123')
  })

  it('ignores the template on malformed transform params', async () => {
    withStorage({ urlTemplate: '!{width}x{height}' })
    const res = await localStorageRouter.request('/storage/images/a.jpg?w=abc&h=150&v=123')
    expect(res.headers.get('Location')).toBe('https://assets.example.com/images/a.jpg?w=abc&h=150&v=123')
  })

  it('still streams local bytes when S3 is disabled', async () => {
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      assets: {
        ...TEST_BLOG_SETTINGS_BUNDLE.assets!,
        storage: { ...TEST_BLOG_SETTINGS_BUNDLE.assets!.storage, enabled: false },
      },
    })
    const res = await localStorageRouter.request('/storage/images/a.jpg?v=123')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/jpeg')
    expect(await res.text()).toBe('img-bytes')
  })
})
