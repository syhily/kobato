import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AssetsSettings } from '@/shared/config/types'

import { TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'
import { setBlogSettingsBundleForTests } from '@/server/domains/settings/services/test-utils'

const { putImage } = await import('@/server/domains/images/storage')
const { getPublicBaseUrl } = await import('@/server/infra/storage/public-url')
const { localBackend } = await import('@/server/infra/storage/backends/local')

// Narrow once: the bundle types `assets` as nullable to express the
// pre-install state, but the fixture always seeds it. Pulling the
// non-null reference out keeps every spread below correctly typed.
const fixtureAssets = TEST_BLOG_SETTINGS_BUNDLE.assets as AssetsSettings

afterEach(() => {
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
})

describe('server/images/storage — toggle dispatch', () => {
  it('reports the public base URL from the assets section host when uploads are ON', () => {
    expect(getPublicBaseUrl()).toBe('https://assets.example.com')
  })

  it('follows asset host updates immediately', () => {
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      assets: {
        ...fixtureAssets,
        asset: { scheme: 'https', host: 'cdn.example' },
      },
    })
    expect(getPublicBaseUrl()).toBe('https://cdn.example')
  })

  it('keeps reporting the host-derived publicBaseUrl when the toggle is OFF (so SSR can still render historical S3 rows)', () => {
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      assets: {
        ...fixtureAssets,
        storage: { ...fixtureAssets.storage, enabled: false },
      },
    })
    expect(getPublicBaseUrl()).toBe('https://assets.example.com')
  })

  it('writes to local storage (no 503) when S3 is off and returns the local driver', async () => {
    // The single-toggle 503 gate is gone: with S3 off, uploads fall through
    // to the local backend instead of refusing. Spy on the local backend so
    // the test never touches the real filesystem.
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      assets: {
        ...fixtureAssets,
        storage: { ...fixtureAssets.storage, enabled: false },
      },
    })
    const putSpy = vi.spyOn(localBackend, 'put').mockResolvedValue({ key: 'images/2026/05/x.jpg', size: 0 })
    try {
      const result = await putImage({
        storagePath: 'images/2026/05/x.jpg',
        body: Buffer.from(''),
        contentType: 'image/jpeg',
      })
      expect(result.driver).toBe('local')
      expect(putSpy).toHaveBeenCalledWith(
        expect.objectContaining({ key: 'images/2026/05/x.jpg', visibility: 'public' }),
      )
    } finally {
      putSpy.mockRestore()
    }
  })
})
