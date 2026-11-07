import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import type { BlogSettingsBundle } from '@/shared/config/types'

import { resetBlogSettingsForTests } from '#/_helpers/blog-settings'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { SECRET_FIELDS } from '@/server/domains/settings/secrets'
import { SECTION_REGISTRY } from '@/server/domains/settings/sections/registry'
import { updateBlogSettingsSection } from '@/server/domains/settings/services/core'
import { refreshBlogSettings } from '@/server/domains/settings/services/hydrate'
import { computeSecretMasks } from '@/server/domains/settings/services/masks'
// Only seams: section-change handlers (real registry, no schedulers) and
// the logger capture ring; everything else runs on the real engine.
import {
  __clearSectionChangeHandlersForTests,
  registerSectionChangeHandler,
} from '@/server/domains/settings/services/section-changes'
import { setting } from '@/server/infra/db/schema/config'
import { DomainError } from '@/server/infra/http/errors'
import { __clearLogCaptureForTests, __logCaptureForTests } from '@/server/infra/logger'
import { getBlogSettingsBundleSync } from '@/shared/config/getters'

const db = getTestDb()

beforeEach(async () => {
  await clearAllTables(db)
  resetBlogSettingsForTests()
  __clearSectionChangeHandlersForTests()
  __clearLogCaptureForTests()
  // Seed the installed baseline (general + assets) so the refresh returns a bundle.
  await db.insert(setting).values([
    {
      scope: 'blog.general',
      data: {
        title: 'Test Blog',
        description: 'A test blog',
        website: 'https://example.com',
        keywords: ['test'],
        author: { name: 'Test Author', email: 'test@example.com', url: 'https://example.com' },
        locale: 'zh-CN',
        timeZone: 'Asia/Shanghai',
        timeFormat: 'relative',
        initialYear: 2024,
      },
    },
    {
      scope: 'blog.assets',
      data: {
        asset: { host: 'cdn.example.com', scheme: 'https' },
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
        upload: { maxBytes: 5 * 1024 * 1024, jpegQuality: 85 },
      },
    },
  ])
})

describe('server/domains/settings/services/core', () => {
  it('rejects the write through the shared defaults validator when the section seed is corrupt', async () => {
    // No stored row → merge base falls back to registry defaults; the
    // message must match the hydration backfill's.
    const mutableRegistry = SECTION_REGISTRY as unknown as Record<string, { defaults: unknown }>
    const original = SECTION_REGISTRY.limits
    mutableRegistry.limits = { ...original, defaults: { maxRequestBodySize: 'ten' } }
    try {
      const error = await updateBlogSettingsSection(db, 'limits', {}, null).catch((e: unknown) => e)

      expect(error).toBeInstanceOf(DomainError)
      expect((error as DomainError).code).toBe('INTERNAL')
      expect((error as DomainError).message).toBe(
        'blog.limits defaults invalid at `maxRequestBodySize`: Invalid input: expected number, received NaN',
      )
    } finally {
      mutableRegistry.limits = original
    }

    const rows = await db.select().from(setting).where(eq(setting.scope, 'blog.limits'))
    expect(rows).toHaveLength(0)
  })

  it('runs the section change handler only after the refreshed snapshot is visible', async () => {
    let observed: number | undefined
    registerSectionChangeHandler('limits', () => {
      observed = getBlogSettingsBundleSync()?.limits?.maxRequestBodySize
    })

    const result = await updateBlogSettingsSection(db, 'limits', { maxRequestBodySize: 2048 }, null)

    expect(result.bundle?.limits?.maxRequestBodySize).toBe(2048)
    expect(observed).toBe(2048)
  })

  it('surfaces a section change handler failure as a save warning', async () => {
    // The row commits before the handler runs, so failures surface as warnings, not errors (P1-5).
    registerSectionChangeHandler('limits', () => {
      throw new Error('reschedule blew up')
    })

    const result = await updateBlogSettingsSection(db, 'limits', { maxRequestBodySize: 2048 }, null)

    expect(result.bundle?.limits?.maxRequestBodySize).toBe(2048)
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toContain('设置已保存')
  })

  it('reports no warnings when the section change handler succeeds', async () => {
    registerSectionChangeHandler('limits', () => {})

    const result = await updateBlogSettingsSection(db, 'limits', { maxRequestBodySize: 2048 }, null)

    expect(result.warnings).toEqual([])
  })

  it('awaits the handler and does not swallow synchronous errors', async () => {
    const error = new Error('sync handler failed')
    registerSectionChangeHandler('limits', () => {
      throw error
    })

    const result = await updateBlogSettingsSection(db, 'limits', { maxRequestBodySize: 2048 }, null)

    expect(result.bundle?.limits?.maxRequestBodySize).toBe(2048)
    expect(result.warnings).toHaveLength(1)
    expect(__logCaptureForTests()).toContainEqual(
      expect.objectContaining({
        level: 'error',
        msg: 'Section change handler failed',
        ctx: { section: 'limits', error: String(error) },
      }),
    )
    const rows = await db.select().from(setting).where(eq(setting.scope, 'blog.limits'))
    expect(rows).toHaveLength(1)
    expect(rows[0].data).toMatchObject({ maxRequestBodySize: 2048 })
  })

  it('awaits the handler and does not swallow asynchronous rejections', async () => {
    const error = new Error('async handler failed')
    registerSectionChangeHandler('limits', async () => {
      throw error
    })

    const result = await updateBlogSettingsSection(db, 'limits', { maxRequestBodySize: 2048 }, null)

    expect(result.bundle?.limits?.maxRequestBodySize).toBe(2048)
    expect(result.warnings).toHaveLength(1)
    expect(__logCaptureForTests()).toContainEqual(
      expect.objectContaining({
        level: 'error',
        msg: 'Section change handler failed',
        ctx: { section: 'limits', error: String(error) },
      }),
    )
  })
})

describe('server/domains/settings/services/core — assets write-path URL rules', () => {
  async function patchError(payload: unknown): Promise<DomainError> {
    const error = await updateBlogSettingsSection(db, 'assets', payload, null).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(DomainError)
    return error as DomainError
  }

  it('rejects an http:// storage endpoint on write', async () => {
    const error = await patchError({ storage: { endpoint: 'http://minio.internal:9000' } })

    expect(error.code).toBe('BAD_REQUEST')
    expect(error.issues).toContainEqual(
      expect.objectContaining({ path: ['storage', 'endpoint'], message: expect.stringContaining('HTTPS') }),
    )
  })

  it('rejects a CDN template that is not an https URL carrying {src}', async () => {
    const error = await patchError({ storage: { urlTemplate: 'http://cdn.example.com/{src}?w={width}' } })

    expect(error.issues).toContainEqual(expect.objectContaining({ path: ['storage', 'urlTemplate'] }))
  })

  it('rejects a scheme-carrying or protocol-relative suffix template', async () => {
    for (const urlTemplate of ['//evil.example.com/x?w={width}', 'javascript:alert(1)']) {
      const error = await patchError({ storage: { urlTemplate } })
      expect(error.issues).toContainEqual(expect.objectContaining({ path: ['storage', 'urlTemplate'] }))
    }
  })

  it('accepts an https full-URL template and a scheme-less suffix template', async () => {
    const full = await updateBlogSettingsSection(
      db,
      'assets',
      { storage: { urlTemplate: 'https://cdn.example.com/fit?url={src}&w={width}' } },
      null,
    )
    expect(full.bundle?.assets?.storage.urlTemplate).toBe('https://cdn.example.com/fit?url={src}&w={width}')

    const suffix = await updateBlogSettingsSection(
      db,
      'assets',
      { storage: { urlTemplate: '?x-oss-process=image/resize,w_{width}' } },
      null,
    )
    expect(suffix.bundle?.assets?.storage.urlTemplate).toBe('?x-oss-process=image/resize,w_{width}')
  })

  it('keeps hydrating a stored http:// endpoint (the rule is write-only)', async () => {
    // A legacy install's row must not fall back to section defaults on
    // boot — hydration deliberately skips the write schema.
    await db
      .update(setting)
      .set({
        data: {
          asset: { host: 'cdn.example.com', scheme: 'https' },
          storage: {
            enabled: true,
            endpoint: 'http://minio.internal:9000',
            region: 'us-east-1',
            bucket: 'assets',
            accessKeyId: 'AKIA',
            secretAccessKey: 'secret',
            forcePathStyle: true,
            urlTemplate: '',
          },
          upload: { maxBytes: 5 * 1024 * 1024, jpegQuality: 85 },
        },
      })
      .where(eq(setting.scope, 'blog.assets'))

    const bundle = await refreshBlogSettings(db)

    expect(bundle?.assets?.storage.enabled).toBe(true)
    expect(bundle?.assets?.storage.endpoint).toBe('http://minio.internal:9000')
  })
})

describe('computeSecretMasks', () => {
  it('derives a last-4 mask for every SECRET_FIELDS entry', () => {
    const bundle = {
      mail: { mail: { smtpPass: 'pass-bb22', mailgunApiKey: 'mg-cc33' } },
      assets: { storage: { secretAccessKey: 's3-dd44' } },
      comments: { comments: { githubToken: 'ghp-ee55' } },
      backup: { encryption: { password: 'bk-ff66' } },
    } as unknown as BlogSettingsBundle

    const masks = computeSecretMasks(bundle)

    // Every SECRET_FIELDS entry must produce a mask — a new row can't silently miss the output.
    for (const { maskKey } of SECRET_FIELDS) {
      expect(masks[maskKey]).not.toBeNull()
    }
    expect(masks).toEqual({
      mailSmtpPassMask: 'bb22',
      mailMailgunApiKeyMask: 'cc33',
      assetsSecretAccessKeyMask: 'dd44',
      commentsGithubTokenMask: 'ee55',
      backupEncryptionPasswordMask: 'ff66',
    })
  })

  it('returns null masks when secrets are missing or empty', () => {
    const bundle = {
      mail: { mail: { smtpPass: 'pass-bb22', mailgunApiKey: null } },
      assets: null,
    } as unknown as BlogSettingsBundle

    const masks = computeSecretMasks(bundle)

    expect(masks).toEqual({
      mailSmtpPassMask: 'bb22',
      mailMailgunApiKeyMask: null,
      assetsSecretAccessKeyMask: null,
      commentsGithubTokenMask: null,
      backupEncryptionPasswordMask: null,
    })
  })
})
