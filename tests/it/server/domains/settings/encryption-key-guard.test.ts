import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  encryptionKey: 'test-encryption-key-32-chars-long!!' as string | undefined,
  findSettingsByScopePrefix: vi.fn(),
  upsertSetting: vi.fn(),
}))

vi.mock('@/server/infra/env', () => ({
  get ENCRYPTION_KEY() {
    return mockState.encryptionKey
  },
  get IGNORE_ENCRYPTION_WARNING() {
    return undefined
  },
  isVitest() {
    return false
  },
  DATA_PATH: '/tmp/kobato-data',
  get DATABASE_URL() {
    return 'postgresql://localhost:5432/test'
  },
  get REDIS_URL() {
    return 'redis://localhost:6379'
  },
  get SESSION_SECRET() {
    return 'test-session-secret-must-be-32-chars-long!'
  },
  get HOST() {
    return '0.0.0.0'
  },
  get PORT() {
    return 4321
  },
  get NODE_ENV() {
    return 'test'
  },
  get LOG_LEVEL() {
    return 'error'
  },
  get DB_POOL_MAX() {
    return 20
  },
  get DB_STATEMENT_TIMEOUT_MS() {
    return 30000
  },
  get REDIS_KEY_PREFIX() {
    return undefined
  },
  get DEFAULT_FONT_PATH() {
    return undefined
  },
}))

vi.mock('@/server/infra/logger', () => ({
  getLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
  L3_KEYS: new Set(),
}))

vi.mock('@/server/infra/db/operations/setting', () => ({
  findSettingsByScopePrefix: mockState.findSettingsByScopePrefix,
  upsertSetting: mockState.upsertSetting,
}))

const db = {
  transaction: vi.fn(async (fn: (tx: NodePgDatabase) => Promise<unknown>) => fn(db as unknown as NodePgDatabase)),
} as unknown as NodePgDatabase
const pool = {} as any

const { updateBlogSettingsSection } = await import('@/server/domains/settings/services/core')

describe('settings service — ENCRYPTION_KEY guard', () => {
  beforeEach(() => {
    mockState.encryptionKey = 'test-encryption-key-32-chars-long!!'
    mockState.findSettingsByScopePrefix.mockReset()
    mockState.upsertSetting.mockReset()
  })

  it('throws BAD_REQUEST when saving a secret section without ENCRYPTION_KEY', async () => {
    mockState.encryptionKey = undefined
    mockState.findSettingsByScopePrefix.mockResolvedValue([])

    await expect(
      updateBlogSettingsSection(
        db,
        pool,
        'mail',
        { mail: { enabled: true, host: 'api.example.com', apiKey: 'secret', sender: 'a@b.co' } },
        null,
      ),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: expect.stringContaining('ENCRYPTION_KEY'),
    })
  })

  it('allows saving a non-secret section without ENCRYPTION_KEY', async () => {
    mockState.encryptionKey = undefined
    mockState.findSettingsByScopePrefix.mockResolvedValue([])
    mockState.upsertSetting.mockResolvedValue({
      id: 1n,
      scope: 'blog.general',
      data: {},
      updatedAt: new Date(),
      updatedBy: null,
    })

    const result = await updateBlogSettingsSection(
      db,
      pool,
      'general',
      {
        title: 'Test',
        description: 'A test blog',
        website: 'https://example.com',
        keywords: [],
        author: { name: 'Tester', email: 'test@example.com', url: 'https://example.com' },
        locale: 'zh-CN',
        timeZone: 'Asia/Shanghai',
        timeFormat: 'yyyy-LL-dd HH:mm',
        initialYear: 2024,
      },
      null,
    )

    expect(result).toBeDefined()
  })
})
