import { __setStorageDirForTests } from '@kobato/server/infra/data-paths'
import { getTestDb } from '@kobato/server/tests/utils/integration-db'
import { makePublicCtx } from '@kobato/server/tests/utils/mock-ctx'
import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '@kobato/settings/tests/utils/blog-settings'
import { call } from '@orpc/server'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const { brandingRouter } = await import('@kobato/server/http/controllers/public/branding.controller')

import type { BrandingAssetInput } from '@kobato/api/contracts/public/branding'
import type { BrandingObjectRef } from '@kobato/settings/types'

const db = getTestDb()

const storageRoot = mkdtempSync(join(tmpdir(), 'branding-procedure-'))

beforeAll(() => {
  __setStorageDirForTests(storageRoot)
  mkdirSync(join(storageRoot, 'branding'), { recursive: true })
  writeFileSync(join(storageRoot, 'branding/favicon.svg'), '<svg>branded</svg>')
})

afterAll(() => {
  __setStorageDirForTests(null)
  rmSync(storageRoot, { recursive: true, force: true })
})

function ref(etag: string, contentType: string): BrandingObjectRef {
  return { etag, contentType, size: 1024, updatedAt: '2024-01-01T00:00:00.000Z', driver: 'local' }
}

describe('brandingRouter.asset', () => {
  beforeEach(() => {
    setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
  })

  it('answers the default favicon with the revalidation profile and a quoted strong etag', async () => {
    const answer = (await call(brandingRouter.asset, { path: '/favicon.svg' }, { context: makePublicCtx({ db }) })) as {
      kind: 'ok'
      body: Blob
      etag: string
      contentType: string
      cacheControl: string
      contentLanguage: string | null
    }
    expect(answer.kind).toBe('ok')
    expect(answer.contentType).toBe('image/svg+xml')
    expect(answer.cacheControl).toBe('public, max-age=3600, must-revalidate')
    expect(answer.contentLanguage).toBeNull()
    expect(answer.etag).toMatch(/^"[a-f0-9]{64}"$/)
    expect(await answer.body.text()).toContain('<svg')
  })

  it('answers NOT_FOUND for a path outside ASSET_ROUTES', async () => {
    await expect(
      call(brandingRouter.asset, { path: '/images/unknown.png' } as BrandingAssetInput, {
        context: makePublicCtx({ db }),
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(
      call(brandingRouter.asset, { path: '../../../etc/passwd' } as BrandingAssetInput, {
        context: makePublicCtx({ db }),
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('answers not-modified for a matching If-None-Match with the same header profile', async () => {
    const ctx = makePublicCtx({ db })
    const first = (await call(brandingRouter.asset, { path: '/favicon.svg' }, { context: ctx })) as { etag: string }
    const second = await call(brandingRouter.asset, { path: '/favicon.svg', ifNoneMatch: first.etag }, { context: ctx })
    expect(second).toMatchObject({
      kind: 'not-modified',
      etag: first.etag,
      contentType: 'image/svg+xml',
      cacheControl: 'public, max-age=3600, must-revalidate',
      contentLanguage: null,
    })
  })

  it('serves a configured branding object with the ref etag', async () => {
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      assets: {
        ...TEST_BLOG_SETTINGS_BUNDLE.assets!,
        branding: { faviconSvg: ref('cafe', 'image/svg+xml') },
      },
    })
    const answer = (await call(brandingRouter.asset, { path: '/favicon.svg' }, { context: makePublicCtx({ db }) })) as {
      kind: 'ok'
      body: Blob
      etag: string
      contentType: string
    }
    expect(answer.etag).toBe('"cafe"')
    expect(answer.contentType).toBe('image/svg+xml')
    expect(await answer.body.text()).toContain('branded')
  })

  it('ignores the configured object while `original` is set on an svg slot', async () => {
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      assets: {
        ...TEST_BLOG_SETTINGS_BUNDLE.assets!,
        branding: { faviconSvg: ref('cafe', 'image/svg+xml') },
      },
    })
    const answer = (await call(
      brandingRouter.asset,
      { path: '/favicon.svg', original: true },
      { context: makePublicCtx({ db }) },
    )) as { kind: string; etag: string }
    expect(answer.kind).toBe('ok')
    expect(answer.etag).not.toBe('"cafe"')
    expect(answer.etag).toMatch(/^"[a-f0-9]{64}"$/)
  })

  it('serves the bundled binary defaults for the icon and open-graph slots', async () => {
    const ctx = makePublicCtx({ db })
    for (const path of ['/favicon.ico', '/apple-touch-icon.png', '/images/open-graph.png']) {
      const answer = (await call(brandingRouter.asset, { path }, { context: ctx })) as {
        kind: string
        body: Blob
        contentType: string
      }
      expect(answer.kind).toBe('ok')
      expect(answer.body.size).toBeGreaterThan(0)
      expect(answer.contentType).not.toBe('')
    }
  })
})
