import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { BlogSettingsBundle } from '@/shared/config/types'

import { SECRET_FIELDS } from '@/server/domains/settings/secrets'
import { computeSecretMasks, updateBlogSettingsSection } from '@/server/domains/settings/services/core'

const mockPool = {} as unknown as Pool
const mockTx = {} as unknown as NodePgDatabase
const mockDb = {
  transaction: vi.fn(async (callback: (tx: NodePgDatabase) => Promise<unknown>) => callback(mockTx)),
} as unknown as NodePgDatabase

const mocks = vi.hoisted(() => {
  const limitsSchema = {
    safeParseAsync: vi.fn().mockResolvedValue({ success: true, data: { maxRequestBodySize: 2048 } }),
  }
  return {
    SECTION_REGISTRY: {
      limits: { scope: 'blog.limits', schema: limitsSchema, key: 'limits', defaults: null },
    },
    hydrateBlogSettings: vi.fn(),
    refreshBlogSettings: vi.fn().mockResolvedValue({ limits: {} } as BlogSettingsBundle),
    upsertSetting: vi.fn().mockResolvedValue({ scope: 'blog.limits', data: {} }),
    getBlogSettingsBundleSync: vi.fn().mockReturnValue(null),
    loggerError: vi.fn(),
    sectionChangeHandlers: new Map<string, (pool: Pool) => void | Promise<void>>(),
  }
})

vi.mock('@/server/domains/settings/sections/registry', () => ({
  SECTION_REGISTRY: mocks.SECTION_REGISTRY,
}))

vi.mock('@/server/domains/settings/services/hydrate', () => ({
  hydrateBlogSettings: mocks.hydrateBlogSettings,
  refreshBlogSettings: mocks.refreshBlogSettings,
}))

vi.mock('@/server/domains/settings/services/section-changes', () => ({
  SECTION_CHANGE_HANDLERS: mocks.sectionChangeHandlers,
}))

vi.mock('@/server/infra/db/operations/setting', () => ({
  findSettingByScope: vi.fn().mockResolvedValue(null),
  upsertSetting: mocks.upsertSetting,
}))

vi.mock('@/shared/config/getters', () => ({
  getBlogSettingsBundleSync: mocks.getBlogSettingsBundleSync,
}))

vi.mock('@/server/infra/logger', () => ({
  getLogger: () => ({ info: vi.fn(), error: mocks.loggerError, warn: vi.fn() }),
}))

describe('server/domains/settings/services/core', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.sectionChangeHandlers.clear()
    mocks.refreshBlogSettings.mockResolvedValue({ limits: {} } as BlogSettingsBundle)
  })

  it('calls refreshBlogSettings before invoking the section change handler', async () => {
    const calls: string[] = []
    mocks.refreshBlogSettings.mockImplementation(async () => {
      calls.push('refresh')
      return { limits: {} } as BlogSettingsBundle
    })

    const handler = vi.fn(async () => {
      calls.push('handler')
    })
    mocks.sectionChangeHandlers.set('limits', handler)

    await updateBlogSettingsSection(mockDb, mockPool, 'limits', { maxRequestBodySize: 2048 }, null)

    expect(calls).toEqual(['refresh', 'handler'])
    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledWith(mockPool)
  })

  it('awaits the handler and does not swallow synchronous errors', async () => {
    const bundle = { limits: { maxRequestBodySize: 2048 } } as unknown as BlogSettingsBundle
    mocks.refreshBlogSettings.mockResolvedValue(bundle)

    const error = new Error('sync handler failed')
    mocks.sectionChangeHandlers.set('limits', () => {
      throw error
    })

    const result = await updateBlogSettingsSection(mockDb, mockPool, 'limits', { maxRequestBodySize: 2048 }, null)

    expect(result).toBe(bundle)
    expect(mocks.loggerError).toHaveBeenCalledWith('Section change handler failed', {
      section: 'limits',
      error: String(error),
    })
  })

  it('awaits the handler and does not swallow asynchronous rejections', async () => {
    const bundle = { limits: { maxRequestBodySize: 2048 } } as unknown as BlogSettingsBundle
    mocks.refreshBlogSettings.mockResolvedValue(bundle)

    const error = new Error('async handler failed')
    mocks.sectionChangeHandlers.set('limits', async () => {
      throw error
    })

    const result = await updateBlogSettingsSection(mockDb, mockPool, 'limits', { maxRequestBodySize: 2048 }, null)

    expect(result).toBe(bundle)
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
      search: { search: { apiKey: 'meili-ee55' } },
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
      searchApiKeyMask: 'ee55',
    })
  })

  it('returns null masks when secrets are missing or empty', () => {
    const bundle = {
      mail: { mail: { apiKey: '', smtpPass: 'pass-bb22', mailgunApiKey: null } },
      assets: null,
      search: { search: {} },
    } as unknown as BlogSettingsBundle

    const masks = computeSecretMasks(bundle)

    expect(masks).toEqual({
      mailApiKeyMask: null,
      mailSmtpPassMask: 'bb22',
      mailMailgunApiKeyMask: null,
      assetsSecretAccessKeyMask: null,
      searchApiKeyMask: null,
    })
  })
})
