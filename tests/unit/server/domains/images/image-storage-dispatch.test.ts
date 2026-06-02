import { afterEach, describe, expect, it } from 'vitest'

import type { AssetsSettings } from '@/shared/config/types'

import { TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'
import { setBlogSettingsBundleForTests } from '@/server/domains/settings/snapshot'

const { deleteImage, getPublicBaseUrl, isUploadEnabled, putImage } = await import('@/server/domains/images/storage')

// Narrow once: the bundle types `assets` as nullable to express the
// pre-install state, but the fixture always seeds it. Pulling the
// non-null reference out keeps every spread below correctly typed.
const fixtureAssets = TEST_BLOG_SETTINGS_BUNDLE.assets as AssetsSettings

afterEach(() => {
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
})

describe('server/images/storage — toggle dispatch', () => {
  it('reports the public base URL from the assets section host when uploads are ON', () => {
    expect(isUploadEnabled()).toBe(true)
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
    expect(isUploadEnabled()).toBe(false)
    expect(getPublicBaseUrl()).toBe('https://assets.example.com')
  })

  it('refuses putImage / deleteImage when the toggle is OFF', async () => {
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      assets: {
        ...fixtureAssets,
        storage: { ...fixtureAssets.storage, enabled: false },
      },
    })
    await expect(
      putImage({
        storagePath: 'images/2026/05/x.jpg',
        body: Buffer.from(''),
        contentType: 'image/jpeg',
      }),
    ).rejects.toMatchObject({ status: 503 })
    await expect(deleteImage('images/2026/05/x.jpg')).rejects.toMatchObject({ status: 503 })
  })
})
