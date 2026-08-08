import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import type { BlogSettingsBundle } from '@/shared/config/types'

import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '#/_helpers/blog-settings'
import { TEST_ENV } from '#/_helpers/env'
import { STORAGE_DIR } from '@/server/infra/paths'
import { localBackend, resolveLocalPath } from '@/server/infra/storage/backends/local'
import { activeBackend, isS3Primary } from '@/server/infra/storage/registry'

// The it setup pins DATA_PATH to a throwaway tmp root, so these tests touch real files, never the dev data dir.
const TEST_PREFIX = 'it-registry-fallback'

// Default test bundle with S3 disabled — mirrors a fresh install.
const LOCAL_ONLY_BUNDLE: BlogSettingsBundle = {
  ...TEST_BLOG_SETTINGS_BUNDLE,
  assets: {
    asset: { host: 'assets.example.com', scheme: 'https' },
    storage: {
      enabled: false,
      endpoint: '',
      region: '',
      bucket: '',
      accessKeyId: '',
      secretAccessKey: '',
      forcePathStyle: false,
      urlTemplate: '',
    },
    upload: { maxBytes: 8 * 1024 * 1024, jpegQuality: 82 },
  },
}

afterAll(async () => {
  // Remove the whole test subtree so nothing litters the shared tmp root.
  await localBackend.deletePrefix(TEST_PREFIX)
})

beforeEach(() => {
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
})

describe('storage/registry — local fallback', () => {
  it('resolves to the local backend when S3 is not configured', () => {
    setBlogSettingsBundleForTests(LOCAL_ONLY_BUNDLE)

    const resolved = activeBackend()

    expect(resolved.driver).toBe('local')
    expect(resolved.backend).toBe(localBackend)
    expect(isS3Primary()).toBe(false)
  })

  it('resolves to s3 under the default test bundle (the fallback is not vacuous)', () => {
    // Proves the local result above comes from the S3 availability check, not a registry hardwired to 'local'.
    const resolved = activeBackend()

    expect(resolved.driver).toBe('s3')
    expect(isS3Primary()).toBe(true)
  })

  it('round-trips bytes through the resolved local backend on the real filesystem', async () => {
    // Guard: never run filesystem assertions against the dev data directory.
    expect(STORAGE_DIR.startsWith(TEST_ENV.storage__data)).toBe(true)

    setBlogSettingsBundleForTests(LOCAL_ONLY_BUNDLE)
    const { backend, driver } = activeBackend()
    expect(driver).toBe('local')

    const key = `${TEST_PREFIX}/roundtrip-w${process.env.VITEST_WORKER_ID ?? '0'}.bin`
    const body = randomBytes(256)

    const meta = await backend.put({ key, body, contentType: 'application/octet-stream' })
    expect(meta.key).toBe(key)
    expect(meta.size).toBe(body.length)

    const abs = resolveLocalPath(key)
    expect(existsSync(abs)).toBe(true)

    const readBack = await backend.get(key)
    expect(readBack.equals(body)).toBe(true)

    await backend.delete(key)
    expect(await backend.exists(key)).toBe(false)
    expect(existsSync(abs)).toBe(false)
  })

  it('falls back to local without throwing when the settings snapshot is not hydrated yet', () => {
    // Unhydrated snapshot: the S3 availability check throws — the registry must degrade to local.
    setBlogSettingsBundleForTests(undefined)

    let resolved: ReturnType<typeof activeBackend> | undefined
    expect(() => {
      resolved = activeBackend()
    }).not.toThrow()
    expect(resolved?.driver).toBe('local')
    expect(isS3Primary()).toBe(false)
  })
})
