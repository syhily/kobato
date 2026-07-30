import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { BlogSettingsBundle } from '@/shared/config/types'

import { resetBlogSettingsForTests } from '#/_helpers/blog-settings'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { SECRET_FIELDS } from '@/server/domains/settings/secrets'
import { SECTION_REGISTRY } from '@/server/domains/settings/sections/registry'
import { computeSecretMasks, updateBlogSettingsSection } from '@/server/domains/settings/services/core'
import { setting } from '@/server/infra/db/schema/config'
import { DomainError } from '@/server/infra/http/errors'
import { getBlogSettingsBundleSync } from '@/shared/config/getters'

// Non-DB seams only: the change-handler map is doubled so a test can
// register a throwing handler without waking the real backup/audit
// schedulers, and the logger is doubled to assert the failure log. Every
// settings read/write goes through the real in-memory engine.
const mocks = vi.hoisted(() => ({
  sectionChangeHandlers: new Map<string, () => void | Promise<void>>(),
  loggerError: vi.fn(),
}))

vi.mock('@/server/domains/settings/services/section-changes', () => ({
  SECTION_CHANGE_HANDLERS: mocks.sectionChangeHandlers,
}))

vi.mock('@/server/infra/logger', () => ({
  getLogger: () => ({ info: vi.fn(), error: mocks.loggerError, warn: vi.fn(), debug: vi.fn() }),
  root: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
  L3_KEYS: new Set<string>(),
}))

const db = getTestDb()

beforeEach(async () => {
  await clearAllTables(db)
  resetBlogSettingsForTests()
  mocks.sectionChangeHandlers.clear()
  mocks.loggerError.mockClear()
  // Seed the rows the snapshot treats as the "installed" baseline so the
  // post-write refresh returns a bundle (general + assets).
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
    // No stored row → the merge base falls back to the registry defaults,
    // validated by the same `validateSectionDefaults` the hydration
    // backfill uses. The thrown message must be identical to the one
    // `buildDefaultSectionPayloads` surfaces for the same corruption.
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

    // The transaction rolled back: no limits row was written.
    const rows = await db.select().from(setting).where(eq(setting.scope, 'blog.limits'))
    expect(rows).toHaveLength(0)
  })

  it('runs the section change handler only after the refreshed snapshot is visible', async () => {
    // Real ordering probe: the handler reads the in-process snapshot; if
    // refreshBlogSettings had not completed first, it would see the old
    // value (or no value) instead of the just-saved one.
    let observed: number | undefined
    mocks.sectionChangeHandlers.set('limits', () => {
      observed = getBlogSettingsBundleSync()?.limits?.maxRequestBodySize
    })

    const result = await updateBlogSettingsSection(db, 'limits', { maxRequestBodySize: 2048 }, null)

    expect(result?.limits?.maxRequestBodySize).toBe(2048)
    expect(observed).toBe(2048)
  })

  it('awaits the handler and does not swallow synchronous errors', async () => {
    const error = new Error('sync handler failed')
    mocks.sectionChangeHandlers.set('limits', () => {
      throw error
    })

    const result = await updateBlogSettingsSection(db, 'limits', { maxRequestBodySize: 2048 }, null)

    expect(result?.limits?.maxRequestBodySize).toBe(2048)
    expect(mocks.loggerError).toHaveBeenCalledWith('Section change handler failed', {
      section: 'limits',
      error: String(error),
    })
    // The write itself committed — a handler failure cannot roll it back.
    const rows = await db.select().from(setting).where(eq(setting.scope, 'blog.limits'))
    expect(rows).toHaveLength(1)
    expect(rows[0].data).toMatchObject({ maxRequestBodySize: 2048 })
  })

  it('awaits the handler and does not swallow asynchronous rejections', async () => {
    const error = new Error('async handler failed')
    mocks.sectionChangeHandlers.set('limits', async () => {
      throw error
    })

    const result = await updateBlogSettingsSection(db, 'limits', { maxRequestBodySize: 2048 }, null)

    expect(result?.limits?.maxRequestBodySize).toBe(2048)
    expect(mocks.loggerError).toHaveBeenCalledWith('Section change handler failed', {
      section: 'limits',
      error: String(error),
    })
  })
})

describe('computeSecretMasks', () => {
  it('derives a last-4 mask for every SECRET_FIELDS entry', () => {
    const bundle = {
      mail: { mail: { apiKey: 'key-aa11', smtpPass: 'pass-bb22', mailgunApiKey: 'mg-cc33' } },
      assets: { storage: { secretAccessKey: 's3-dd44' } },
    } as unknown as BlogSettingsBundle

    const masks = computeSecretMasks(bundle)

    // Runtime parity guard: every configured secret field produces a mask
    // entry, so a new SECRET_FIELDS row cannot silently miss the output.
    for (const { maskKey } of SECRET_FIELDS) {
      expect(masks[maskKey]).not.toBeNull()
    }
    expect(masks).toEqual({
      mailApiKeyMask: 'aa11',
      mailSmtpPassMask: 'bb22',
      mailMailgunApiKeyMask: 'cc33',
      assetsSecretAccessKeyMask: 'dd44',
    })
  })

  it('returns null masks when secrets are missing or empty', () => {
    const bundle = {
      mail: { mail: { apiKey: '', smtpPass: 'pass-bb22', mailgunApiKey: null } },
      assets: null,
    } as unknown as BlogSettingsBundle

    const masks = computeSecretMasks(bundle)

    expect(masks).toEqual({
      mailApiKeyMask: null,
      mailSmtpPassMask: 'bb22',
      mailMailgunApiKeyMask: null,
      assetsSecretAccessKeyMask: null,
    })
  })
})
