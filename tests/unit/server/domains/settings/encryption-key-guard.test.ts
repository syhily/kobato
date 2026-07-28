import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  encryptionKey: 'test-encryption-key-32-chars-long!!' as string | undefined,
  findSettingByScope: vi.fn(),
  findSettingsByScopePrefix: vi.fn(),
  upsertSetting: vi.fn(),
}))

vi.mock('@/server/infra/config', () => ({
  get serverConfig() {
    return {
      server: { host: '0.0.0.0', port: 4321, loggingLevel: 'error' },
      database: {
        url: 'postgresql://localhost:5434/test',
        poolMax: 20,
        statementTimeoutMs: 30000,
        restoreRole: undefined,
      },
      security: {
        sessionSecret: ['test-session-secret-must-be-32-chars-long!'],
        encryptionKey: mockState.encryptionKey,
      },
      storage: { data: '/tmp/kobato-data', defaultFont: undefined },
    }
  },
  isVitest() {
    return false
  },
  get NODE_ENV() {
    return 'test'
  },
}))

vi.mock('@/server/infra/logger', () => ({
  getLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
  L3_KEYS: new Set(),
}))

vi.mock('@/server/infra/db/operations/setting', () => ({
  findSettingByScope: mockState.findSettingByScope,
  findSettingsByScopePrefix: mockState.findSettingsByScopePrefix,
  upsertSetting: mockState.upsertSetting,
}))
vi.mock('@/server/domains/settings/services/section-changes', () => ({
  SECTION_CHANGE_HANDLERS: new Map(),
}))
vi.mock('@/server/domains/settings/services/hydrate', () => ({
  hydrateBlogSettings: vi.fn(async () => null),
  refreshBlogSettings: vi.fn(async () => ({
    siteIdentity: {
      title: 'Test Blog',
      description: 'A test blog',
      website: 'https://example.com',
      initialYear: 2024,
      author: { name: 'Tester', email: 'test@example.com', url: 'https://example.com' },
      locale: 'zh-CN',
      timeZone: 'Asia/Shanghai',
      timeFormat: 'yyyy-LL-dd HH:mm',
    },
    assets: null,
    general: {
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
  })),
}))

const db = {
  transaction: vi.fn(async (fn: (tx: NodePgDatabase) => Promise<unknown>) => fn(db as unknown as NodePgDatabase)),
} as unknown as NodePgDatabase
const pool = {} as any

const { updateBlogSettingsSection } = await import('@/server/domains/settings/services/core')

describe('settings service — ENCRYPTION_KEY guard', () => {
  beforeEach(() => {
    mockState.encryptionKey = 'test-encryption-key-32-chars-long!!'
    mockState.findSettingByScope.mockReset()
    mockState.findSettingByScope.mockResolvedValue(null)
    mockState.findSettingsByScopePrefix.mockReset()
    mockState.upsertSetting.mockReset()
  })

  it('allows saving a non-secret section', async () => {
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
