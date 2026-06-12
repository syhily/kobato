import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { BlogSettingsBundle } from '@/shared/config/types'

import { registerSectionChangeHandler, updateBlogSettingsSection } from '@/server/domains/settings/services/core'

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
  }
})

vi.mock('@/server/domains/settings/sections/registry', () => ({
  SECTION_REGISTRY: mocks.SECTION_REGISTRY,
}))

vi.mock('@/server/domains/settings/services/hydrate', () => ({
  hydrateBlogSettings: mocks.hydrateBlogSettings,
  refreshBlogSettings: mocks.refreshBlogSettings,
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
    registerSectionChangeHandler('limits', handler)

    await updateBlogSettingsSection(mockDb, mockPool, 'limits', { maxRequestBodySize: 2048 }, null)

    expect(calls).toEqual(['refresh', 'handler'])
    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledWith(mockPool)
  })

  it('awaits the handler and does not swallow synchronous errors', async () => {
    const bundle = { limits: { maxRequestBodySize: 2048 } } as unknown as BlogSettingsBundle
    mocks.refreshBlogSettings.mockResolvedValue(bundle)

    const error = new Error('sync handler failed')
    registerSectionChangeHandler('limits', () => {
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
    registerSectionChangeHandler('limits', async () => {
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
