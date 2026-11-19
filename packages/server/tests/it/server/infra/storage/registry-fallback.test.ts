import type { BlogSettingsBundle } from '@kobato/settings/types.ts'

import { STORAGE_DIR } from '@kobato/server/infra/data-paths.ts'
import { localBackend, resolveLocalPath } from '@kobato/server/infra/storage/backends/local.ts'
import { activeBackend, isS3Primary } from '@kobato/server/infra/storage/registry.ts'
import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '@kobato/test/blog-settings.ts'
import { TEST_ENV } from '@kobato/test/env.ts'
import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

const TEST_PREFIX = 'it-registry-fallback'

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
    const resolved = activeBackend()

    expect(resolved.driver).toBe('s3')
    expect(isS3Primary()).toBe(true)
  })

  it('round-trips bytes through the resolved local backend on the real filesystem', async () => {
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
    setBlogSettingsBundleForTests(undefined)

    let resolved: ReturnType<typeof activeBackend> | undefined
    expect(() => {
      resolved = activeBackend()
    }).not.toThrow()
    expect(resolved?.driver).toBe('local')
    expect(isS3Primary()).toBe(false)
  })
})
