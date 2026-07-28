import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Database } from '@/server/infra/db/database'
import type { Setting } from '@/server/infra/db/types'
import type { BlogSettingsBundle } from '@/shared/config/types'

const { getLogger } = vi.hoisted(() => {
  const loggerMock = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }
  return { loggerMock, getLogger: vi.fn(() => loggerMock) }
})

vi.mock('@/server/infra/db/operations/setting', () => ({
  findSettingByScope: vi.fn(),
  findSettingsByScopePrefix: vi.fn(),
  upsertSetting: vi.fn(),
}))

vi.mock('@/server/infra/logger', () => ({
  getLogger,
  L3_KEYS: new Set([
    'email',
    'ip',
    'clientAddress',
    'remoteAddress',
    'userAgent',
    'phone',
    'authorEmail',
    'authorIp',
    'cookie',
    'deviceId',
    'name',
  ]),
}))

// Section-change dispatch (backup/audit reschedule, mail transport
// invalidation) is covered by the unit tests; keep it out of these
// persistence-focused cases.
vi.mock('@/server/domains/settings/services/section-changes', () => ({
  SECTION_CHANGE_HANDLERS: new Map(),
}))

const db = {
  // Sync — production calls db.transaction synchronously (node:sqlite).
  transaction: vi.fn((fn: (tx: Database) => unknown) => fn(db)),
} as unknown as Database

const settingQueries = await import('@/server/infra/db/operations/setting')
const { updateBlogSettingsSection } = await import('@/server/domains/settings/services/core')
const { hydrateBlogSettings } = await import('@/server/domains/settings/services/hydrate')
const { resetBlogSettingsForTests, setBlogSettingsBundleForTests } = await import('#/_helpers/blog-settings')
const { getBlogSettingsBundleSync, getCacheSettings } = await import('@/shared/config/getters')
const { DomainError } = await import('@/server/infra/http/errors')

// Bucketed settings fixture. The DB stores one row per section so
// `bundleRows()` projects this fully-populated bundle into the per-row
// format that `findSettingsByScopePrefix` returns.
const fixtureBundle: BlogSettingsBundle = {
  siteIdentity: {
    title: 'fixture title',
    description: 'fixture description',
    website: 'https://example.com',
    keywords: [],
    author: { name: 'tester', email: 'test@example.com', url: 'https://example.com' },
    locale: 'zh-CN',
    timeZone: 'Asia/Shanghai',
    timeFormat: 'yyyy-LL-dd HH:mm',
    initialYear: 2024,
  },
  assets: {
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
    upload: { maxBytes: 8 * 1024 * 1024, jpegQuality: 82 },
  },
  navigation: { navigation: { sideNav: [], footerNav: [] } },
  socials: { socials: [] },
  content: {
    pagination: { posts: 12, category: 12, tags: 12, search: 12 },
    feed: { full: false, size: 20 },
    post: { sort: 'desc', sortBy: 'publishedAt', featureEnabled: false },
    footnotes: { sectionTitle: '尾声礼记' },
  },
  sidebar: {
    sidebar: {
      widgets: [
        { type: 'search', enabled: true },
        { type: 'recentPosts', enabled: true, count: 5 },
        { type: 'recentComments', enabled: true, count: 5 },
        { type: 'randomTags', enabled: true, count: 20 },
        { type: 'todayCalendar', enabled: true },
      ],
      dailyQuote: { source: 'shanbay', customQuotes: [] },
    },
  },
  comments: {
    comments: {
      size: 10,
      avatar: { mirror: 'https://gravatar.com/avatar/' },
      tokenTtlSeconds: 1800,
    },
  },
  seo: {
    toc: { minHeadingLevel: 2, maxHeadingLevel: 4 },
    og: { width: 1200, height: 630 },
  },

  mail: {
    mail: {
      enabled: false,
      host: 'api.zeabur.com',
      apiKey: '',
      sender: 'noreply@example.com',
      transport: 'zeabur',
      smtpHost: '',
      smtpPort: 587,
      smtpUser: '',
      smtpPass: '',
      smtpSecure: false,
      smtpRequireTls: true,
      smtpRejectUnauthorized: true,
      mailgunDomain: '',
      mailgunApiKey: '',
    },
  },
  newsletter: {
    newsletter: { enabled: false, fromName: '', subjectPrefix: '' },
  },
  cache: {
    cache: {
      og: { prefix: 'og:', ttlSeconds: 3600 },
      calendar: { prefix: 'calendar:', ttlSeconds: 3600 },
      avatar: { prefix: 'avatar:', ttlSeconds: 3600 },
      imageMeta: { prefix: 'image-meta:', ttlSeconds: 3600 },
      searchResult: { prefix: 'search-result:', ttlSeconds: 60 * 60 },
    },
  },
  rateLimit: {
    signInIp: { windowSeconds: 60 * 30, maxAttempts: 5 },
    commentPostIp: { windowSeconds: 60 * 60, maxAttempts: 12 },
    commentPostEmail: { windowSeconds: 60 * 60, maxAttempts: 8 },
    likeIncreaseIp: { windowSeconds: 60 * 60, maxAttempts: 30 },
    inviteIp: { windowSeconds: 60 * 60, maxAttempts: 5 },
    inviteEmail: { windowSeconds: 60 * 60, maxAttempts: 1 },
    passwordResetIp: { windowSeconds: 60 * 30, maxAttempts: 3 },
    passwordResetEmail: { windowSeconds: 60 * 5, maxAttempts: 1 },
    passwordResetTarget: { windowSeconds: 60, maxAttempts: 1 },
    resourceIp: { windowSeconds: 60, maxAttempts: 60 },
    otpSendIp: { windowSeconds: 60 * 5, maxAttempts: 3 },
    otpSendEmail: { windowSeconds: 60 * 5, maxAttempts: 1 },
    otpVerifyIp: { windowSeconds: 60 * 5, maxAttempts: 5 },
    otpVerifyEmail: { windowSeconds: 60 * 5, maxAttempts: 5 },
    signInEmail: { windowSeconds: 60 * 30, maxAttempts: 5 },
    passkeyAuthBeginIp: { windowSeconds: 60 * 5, maxAttempts: 10 },
    passkeyAuthFinishIp: { windowSeconds: 60 * 5, maxAttempts: 10 },
    passkeyRegisterBeginIp: { windowSeconds: 60 * 5, maxAttempts: 10 },
    passkeyRegisterFinishIp: { windowSeconds: 60 * 5, maxAttempts: 10 },
    passkeySetForceIp: { windowSeconds: 60 * 5, maxAttempts: 10 },
    passkeyDeleteIp: { windowSeconds: 60 * 5, maxAttempts: 10 },
  },
  fonts: {
    og: { family: '' },
    calendar: { family: '' },
    global: [],
    post: [],
    code: [],
  },
  backup: {
    scheduled: { enabled: false, frequency: 'daily', hour: 3, minute: 0 },
    retention: { enabled: true, days: 30 },
  },
  limits: {
    maxRequestBodySize: 10 * 1024 * 1024,
    sessionMaxAge: 60 * 60 * 24 * 30,
    auditLogDbRetentionDays: 30,
    auditLogArchiveRetentionDays: 180,
  },
  analytics: {
    analytics: { trackAdmin: false, keepBotRows: false },
  },
  security: {
    csrf: { enabled: true, exemptPaths: [] },
    cors: { enabled: false, origins: [] },
    passkey: { enabled: false },
  },
}

function bundleRows(bundle: BlogSettingsBundle): Setting[] {
  const map: Record<keyof BlogSettingsBundle, string> = {
    siteIdentity: 'blog.general',
    assets: 'blog.assets',
    backup: 'blog.backup',
    navigation: 'blog.navigation',
    socials: 'blog.socials',
    content: 'blog.content',
    sidebar: 'blog.sidebar',
    comments: 'blog.comments',
    seo: 'blog.seo',
    mail: 'blog.mail',
    newsletter: 'blog.newsletter',
    cache: 'blog.cache',
    rateLimit: 'blog.rateLimit',
    fonts: 'blog.fonts',
    limits: 'blog.limits',
    analytics: 'blog.analytics',
    security: 'blog.security',
  }
  const rows: Setting[] = []
  let id = 1
  for (const key of Object.keys(map) as (keyof BlogSettingsBundle)[]) {
    const value = bundle[key]
    if (value === null) {
      continue
    }
    rows.push({
      id: id++,
      scope: map[key],
      data: value as unknown as Record<string, unknown>,
      updatedAt: new Date(),
      updatedBy: null,
    } as Setting)
  }
  return rows
}

beforeEach(async () => {
  vi.mocked(settingQueries.findSettingByScope).mockReset()
  vi.mocked(settingQueries.findSettingsByScopePrefix).mockReset()
  vi.mocked(settingQueries.upsertSetting).mockReset()
  vi.clearAllMocks()
  resetBlogSettingsForTests()
})

describe('services/settings — hydrateBlogSettings', () => {
  it('returns null when no DB rows exist (pre-install)', async () => {
    vi.mocked(settingQueries.findSettingsByScopePrefix).mockReturnValue([])

    const bundle = await hydrateBlogSettings(db)

    expect(bundle).toBeNull()
  })

  it('returns the assembled bundle when every section row passes schema validation', async () => {
    vi.mocked(settingQueries.findSettingsByScopePrefix).mockReturnValue(bundleRows(fixtureBundle))

    const bundle = await hydrateBlogSettings(db)

    expect(bundle).not.toBeNull()
    expect(bundle?.siteIdentity?.title).toBe(fixtureBundle.siteIdentity!.title)
    expect(bundle?.sidebar?.sidebar.widgets[0].enabled).toBe(true)
  })

  it('treats a deployment as uninstalled when only some sections exist', async () => {
    // Only siteIdentity present; the snapshot module requires both
    // siteIdentity AND assets to consider the deployment installed.
    vi.mocked(settingQueries.findSettingsByScopePrefix).mockReturnValue([
      {
        id: 1,
        scope: 'blog.general',
        data: fixtureBundle.siteIdentity as unknown as Record<string, unknown>,
        updatedAt: new Date(),
        updatedBy: null,
      } as Setting,
    ])

    const bundle = await hydrateBlogSettings(db)

    expect(bundle).toBeNull()
  })
})

describe('services/settings — updateBlogSettingsSection', () => {
  it('rejects an invalid section payload with DomainError(400)', async () => {
    vi.mocked(settingQueries.findSettingsByScopePrefix).mockReturnValue([])

    await expect(updateBlogSettingsSection(db, 'general', { title: '' }, null)).rejects.toBeInstanceOf(DomainError)
    expect(settingQueries.upsertSetting).not.toHaveBeenCalled()
  })

  it("writes the validated general payload to scope='blog.general' verbatim", async () => {
    // Mock react-to upsert so post-write re-hydration sees the new value.
    let currentRows = bundleRows(fixtureBundle)
    vi.mocked(settingQueries.findSettingsByScopePrefix).mockImplementation(() => currentRows)
    vi.mocked(settingQueries.upsertSetting).mockImplementation((_db, data, updatedBy, scope) => {
      currentRows = currentRows
        .filter((row) => row.scope !== scope)
        .concat([
          {
            id: 99,
            scope,
            data: data as Record<string, unknown>,
            updatedAt: new Date(),
            updatedBy,
          } as Setting,
        ])
      return { id: 99, scope, data: data as Record<string, unknown>, updatedAt: new Date(), updatedBy }
    })

    const next = await updateBlogSettingsSection(
      db,
      'general',
      {
        title: '雨帆',
        description: 'desc',
        website: 'https://example.com',
        keywords: ['x'],
        author: { name: 'Yufan', email: 'a@b.co', url: 'https://example.com' },
        locale: 'zh-CN',
        timeZone: 'Asia/Shanghai',
        timeFormat: 'yyyy-LL-dd HH:mm',
        initialYear: 2024,
      },
      42,
    )

    expect(settingQueries.upsertSetting).toHaveBeenCalledOnce()
    const [, data, updatedBy, scope] = vi.mocked(settingQueries.upsertSetting).mock.calls[0]
    expect(scope).toBe('blog.general')
    expect((data as Record<string, unknown>).title).toBe('雨帆')
    expect((data as Record<string, unknown>).settings).toBeUndefined()
    expect(updatedBy).toBe(42)
    expect(next?.siteIdentity?.title).toBe('雨帆')
  })

  it("writes the assets patch to scope='blog.assets' only and preserves the unchanged secret", async () => {
    const existing = bundleRows(fixtureBundle).map((row) =>
      row.scope === 'blog.assets'
        ? ({
            ...row,
            data: {
              ...(row.data as Record<string, unknown>),
              storage: {
                ...((row.data as Record<string, unknown>).storage as Record<string, unknown>),
                secretAccessKey: 'STORED',
              },
            },
          } as Setting)
        : row,
    )
    vi.mocked(settingQueries.findSettingByScope).mockReturnValueOnce(
      existing.find((row) => row.scope === 'blog.assets')!,
    )
    vi.mocked(settingQueries.findSettingsByScopePrefix).mockReturnValue(existing)
    vi.mocked(settingQueries.upsertSetting).mockReturnValue({
      id: 1,
      scope: 'blog.general',
      data: {},
      updatedAt: new Date(),
      updatedBy: null,
    } as Setting)

    await updateBlogSettingsSection(
      db,
      'assets',
      {
        asset: { host: 'cdn.test.example', scheme: 'https' },
        storage: {
          enabled: false,
          endpoint: '',
          region: '',
          bucket: '',
          accessKeyId: '',
          forcePathStyle: false,
          urlTemplate: '',
        },
        upload: { maxBytes: 8 * 1024 * 1024, jpegQuality: 82 },
      },
      null,
    )

    const [, data, , scope] = vi.mocked(settingQueries.upsertSetting).mock.calls[0]
    expect(scope).toBe('blog.assets')
    const payload = data as Record<string, unknown>
    expect(payload.asset).toEqual({ host: 'cdn.test.example', scheme: 'https' })
    const storage = payload.storage as Record<string, unknown>
    expect(typeof storage.secretAccessKey).toBe('string')
    expect((storage.secretAccessKey as string).length).toBeGreaterThan(0)
    expect(settingQueries.findSettingByScope).toHaveBeenCalledWith(db, 'blog.assets')
  })

  it('reads only its own section row when patching a single section (write isolation)', async () => {
    vi.mocked(settingQueries.findSettingsByScopePrefix).mockReturnValue(bundleRows(fixtureBundle))
    vi.mocked(settingQueries.findSettingByScope).mockReturnValue(null)
    vi.mocked(settingQueries.upsertSetting).mockReturnValue({
      id: 1,
      scope: 'blog.general',
      data: {},
      updatedAt: new Date(),
      updatedBy: null,
    } as Setting)

    await updateBlogSettingsSection(
      db,
      'navigation',
      { navigation: { sideNav: [{ text: 'Home', link: '/' }], footerNav: [] } },
      null,
    )

    // The merge base costs exactly one read of the section's own row.
    expect(settingQueries.findSettingByScope).toHaveBeenCalledExactlyOnceWith(db, 'blog.navigation')

    const [, data, , scope] = vi.mocked(settingQueries.upsertSetting).mock.calls[0]
    expect(scope).toBe('blog.navigation')
    expect((data as Record<string, unknown>).navigation).toEqual({
      sideNav: [{ text: 'Home', link: '/' }],
      footerNav: [],
    })
  })
})

describe('services/settings — mail section', () => {
  it("writes the full mail patch to scope='blog.mail' and encrypts every provided secret", async () => {
    vi.mocked(settingQueries.findSettingsByScopePrefix).mockReturnValue(bundleRows(fixtureBundle))
    vi.mocked(settingQueries.findSettingByScope).mockReturnValue(null)
    vi.mocked(settingQueries.upsertSetting).mockReturnValue({
      id: 1,
      scope: 'blog.general',
      data: {},
      updatedAt: new Date(),
      updatedBy: null,
    } as Setting)

    await updateBlogSettingsSection(
      db,
      'mail',
      {
        mail: {
          enabled: true,
          host: 'api.zeabur.com',
          apiKey: 'NEWKEY',
          smtpPass: 'NEWSMTPPASS',
          mailgunApiKey: 'NEWMAILGUNKEY',
          sender: 'noreply@example.com',
        },
      },
      null,
    )

    const [, data, , scope] = vi.mocked(settingQueries.upsertSetting).mock.calls[0]
    expect(scope).toBe('blog.mail')
    const mail = (data as Record<string, unknown>).mail as Record<string, unknown>
    expect(mail.enabled).toBe(true)
    expect(mail.host).toBe('api.zeabur.com')
    expect(typeof mail.apiKey).toBe('string')
    expect((mail.apiKey as string).length).toBeGreaterThan(0)
    expect(String(mail.apiKey).startsWith('enc2:')).toBe(true)
    expect(typeof mail.smtpPass).toBe('string')
    expect(String(mail.smtpPass).startsWith('enc2:')).toBe(true)
    expect(typeof mail.mailgunApiKey).toBe('string')
    expect(String(mail.mailgunApiKey).startsWith('enc2:')).toBe(true)
    expect(mail.sender).toBe('noreply@example.com')
    // Every write reads its own section row once for the merge base.
    expect(settingQueries.findSettingByScope).toHaveBeenCalledExactlyOnceWith(db, 'blog.mail')
  })

  it("preserves the existing apiKey by reading scope='blog.mail' when omitted", async () => {
    vi.mocked(settingQueries.findSettingByScope).mockReturnValueOnce({
      id: 1,
      scope: 'blog.mail',
      data: {
        mail: { enabled: true, host: 'old.example.com', apiKey: 'STORED', sender: 'a@b.co' },
      },
      updatedAt: new Date(),
      updatedBy: null,
    } as Setting)
    vi.mocked(settingQueries.findSettingsByScopePrefix).mockReturnValue(bundleRows(fixtureBundle))
    vi.mocked(settingQueries.upsertSetting).mockReturnValue({
      id: 1,
      scope: 'blog.general',
      data: {},
      updatedAt: new Date(),
      updatedBy: null,
    } as Setting)

    await updateBlogSettingsSection(
      db,
      'mail',
      {
        mail: { enabled: true, host: 'api.zeabur.com', sender: 'noreply@example.com' },
      },
      null,
    )

    expect(settingQueries.findSettingByScope).toHaveBeenCalledExactlyOnceWith(db, 'blog.mail')
    const [, data] = vi.mocked(settingQueries.upsertSetting).mock.calls[0]
    const mail = (data as Record<string, unknown>).mail as Record<string, unknown>
    expect(typeof mail.apiKey).toBe('string')
    expect((mail.apiKey as string).length).toBeGreaterThan(0)
    expect(mail.host).toBe('api.zeabur.com')
    expect(mail.sender).toBe('noreply@example.com')
    expect(mail.enabled).toBe(true)
  })

  it('rejects a sender that is not a valid email', async () => {
    vi.mocked(settingQueries.findSettingsByScopePrefix).mockReturnValue([])

    await expect(
      updateBlogSettingsSection(
        db,
        'mail',
        { mail: { enabled: false, host: 'api.zeabur.com', apiKey: '', sender: 'not-an-email' } },
        null,
      ),
    ).rejects.toBeInstanceOf(DomainError)
    expect(settingQueries.upsertSetting).not.toHaveBeenCalled()
  })

  it("preserves the existing smtpPass by reading scope='blog.mail' when omitted", async () => {
    vi.mocked(settingQueries.findSettingByScope).mockReturnValueOnce({
      id: 1,
      scope: 'blog.mail',
      data: {
        mail: {
          enabled: true,
          host: 'api.zeabur.com',
          apiKey: 'ZEABURKEY',
          sender: 'a@b.co',
          transport: 'smtp',
          smtpHost: 'smtp.old.com',
          smtpPort: 587,
          smtpUser: 'olduser',
          smtpPass: 'STOREDSMTPPASS',
          smtpSecure: false,
        },
      },
      updatedAt: new Date(),
      updatedBy: null,
    } as Setting)
    vi.mocked(settingQueries.findSettingsByScopePrefix).mockReturnValue(bundleRows(fixtureBundle))
    vi.mocked(settingQueries.upsertSetting).mockReturnValue({
      id: 1,
      scope: 'blog.general',
      data: {},
      updatedAt: new Date(),
      updatedBy: null,
    } as Setting)

    await updateBlogSettingsSection(
      db,
      'mail',
      {
        mail: {
          enabled: true,
          host: 'api.zeabur.com',
          sender: 'noreply@example.com',
          transport: 'smtp',
          smtpHost: 'smtp.example.com',
          smtpPort: 587,
          smtpUser: 'user',
          smtpSecure: true,
        },
      },
      null,
    )

    const [, data] = vi.mocked(settingQueries.upsertSetting).mock.calls[0]
    const mail = (data as Record<string, unknown>).mail as Record<string, unknown>
    expect(typeof mail.smtpPass).toBe('string')
    expect((mail.smtpPass as string).length).toBeGreaterThan(0)
    expect(mail.smtpHost).toBe('smtp.example.com')
    expect(mail.smtpUser).toBe('user')
    expect(mail.smtpSecure).toBe(true)
    // apiKey is preserved (not in the patch) and then re-encrypted
    // alongside smtpPass — both secrets in the mail section are now
    // routed through `encryptSecretsInRow`, not just the first one.
    expect(typeof mail.apiKey).toBe('string')
    expect(mail.apiKey).not.toBe('ZEABURKEY')
    expect(String(mail.apiKey).startsWith('enc2:')).toBe(true)
  })

  it("preserves the existing mailgunApiKey by reading scope='blog.mail' when omitted", async () => {
    vi.mocked(settingQueries.findSettingByScope).mockReturnValueOnce({
      id: 1,
      scope: 'blog.mail',
      data: {
        mail: {
          enabled: true,
          host: 'api.zeabur.com',
          apiKey: 'ZEABURKEY',
          sender: 'a@b.co',
          transport: 'mailgun',
          smtpHost: '',
          smtpPort: 587,
          smtpUser: '',
          smtpPass: '',
          smtpSecure: false,
          mailgunDomain: 'mg.old.com',
          mailgunApiKey: 'STOREDMAILGUNKEY',
        },
      },
      updatedAt: new Date(),
      updatedBy: null,
    } as Setting)
    vi.mocked(settingQueries.findSettingsByScopePrefix).mockReturnValue(bundleRows(fixtureBundle))
    vi.mocked(settingQueries.upsertSetting).mockReturnValue({
      id: 1,
      scope: 'blog.general',
      data: {},
      updatedAt: new Date(),
      updatedBy: null,
    } as Setting)

    await updateBlogSettingsSection(
      db,
      'mail',
      {
        mail: {
          enabled: true,
          host: 'api.zeabur.com',
          sender: 'noreply@mg.example.com',
          transport: 'mailgun',
          mailgunDomain: 'mg.example.com',
        },
      },
      null,
    )

    const [, data] = vi.mocked(settingQueries.upsertSetting).mock.calls[0]
    const mail = (data as Record<string, unknown>).mail as Record<string, unknown>
    expect(mail.mailgunDomain).toBe('mg.example.com')
    expect(mail.sender).toBe('noreply@mg.example.com')
    // mailgunApiKey was omitted from the patch and preserved from the
    // existing row, then routed through encryptSecretsInRow.
    expect(typeof mail.mailgunApiKey).toBe('string')
    expect(mail.mailgunApiKey).not.toBe('STOREDMAILGUNKEY')
    expect(String(mail.mailgunApiKey).startsWith('enc2:')).toBe(true)
    // The other two mail secrets were preserved too.
    expect(String(mail.apiKey).startsWith('enc2:')).toBe(true)
  })
})

describe('services/settings — rateLimit section', () => {
  it("writes a valid rateLimit patch to scope='blog.rateLimit' verbatim", async () => {
    let currentRows = bundleRows(fixtureBundle)
    vi.mocked(settingQueries.findSettingsByScopePrefix).mockImplementation(() => currentRows)
    vi.mocked(settingQueries.upsertSetting).mockImplementation((_db, data, updatedBy, scope) => {
      currentRows = currentRows
        .filter((row) => row.scope !== scope)
        .concat([
          {
            id: 99,
            scope,
            data: data as Record<string, unknown>,
            updatedAt: new Date(),
            updatedBy,
          } as Setting,
        ])
      return { id: 99, scope, data: data as Record<string, unknown>, updatedAt: new Date(), updatedBy }
    })

    const next = await updateBlogSettingsSection(
      db,
      'rateLimit',
      {
        signInIp: { windowSeconds: 600, maxAttempts: 3 },
        signInEmail: { windowSeconds: 60 * 30, maxAttempts: 5 },
        commentPostIp: { windowSeconds: 60 * 30, maxAttempts: 6 },
        commentPostEmail: { windowSeconds: 60 * 30, maxAttempts: 4 },
        likeIncreaseIp: { windowSeconds: 60 * 5, maxAttempts: 100 },
        inviteIp: { windowSeconds: 60 * 60, maxAttempts: 5 },
        inviteEmail: { windowSeconds: 60 * 60, maxAttempts: 1 },
        passwordResetIp: { windowSeconds: 60 * 30, maxAttempts: 3 },
        passwordResetEmail: { windowSeconds: 60 * 5, maxAttempts: 1 },
        passwordResetTarget: { windowSeconds: 60, maxAttempts: 1 },
        resourceIp: { windowSeconds: 60, maxAttempts: 60 },
        otpSendIp: { windowSeconds: 60 * 5, maxAttempts: 3 },
        otpSendEmail: { windowSeconds: 60 * 5, maxAttempts: 1 },
        otpVerifyIp: { windowSeconds: 60 * 5, maxAttempts: 5 },
        otpVerifyEmail: { windowSeconds: 60 * 5, maxAttempts: 5 },
        passkeyAuthBeginIp: { windowSeconds: 60 * 5, maxAttempts: 10 },
        passkeyAuthFinishIp: { windowSeconds: 60 * 5, maxAttempts: 10 },
        passkeyRegisterBeginIp: { windowSeconds: 60 * 5, maxAttempts: 10 },
        passkeyRegisterFinishIp: { windowSeconds: 60 * 5, maxAttempts: 10 },
        passkeySetForceIp: { windowSeconds: 60 * 5, maxAttempts: 10 },
        passkeyDeleteIp: { windowSeconds: 60 * 5, maxAttempts: 10 },
      },
      11,
    )

    const [, data, updatedBy, scope] = vi.mocked(settingQueries.upsertSetting).mock.calls[0]
    expect(scope).toBe('blog.rateLimit')
    expect(updatedBy).toBe(11)
    expect(data).toMatchObject({
      signInIp: { windowSeconds: 600, maxAttempts: 3 },
      likeIncreaseIp: { windowSeconds: 60 * 5, maxAttempts: 100 },
    })
    expect(next?.rateLimit?.signInIp).toEqual({ windowSeconds: 600, maxAttempts: 3 })
  })

  it('rejects a window shorter than 60s', async () => {
    vi.mocked(settingQueries.findSettingsByScopePrefix).mockReturnValue([])

    await expect(
      updateBlogSettingsSection(
        db,
        'rateLimit',
        {
          signInIp: { windowSeconds: 30, maxAttempts: 5 },
          commentPostIp: { windowSeconds: 3600, maxAttempts: 12 },
          commentPostEmail: { windowSeconds: 3600, maxAttempts: 8 },
          likeIncreaseIp: { windowSeconds: 3600, maxAttempts: 30 },
          inviteIp: { windowSeconds: 3600, maxAttempts: 5 },
          passwordResetIp: { windowSeconds: 1800, maxAttempts: 3 },
        },
        null,
      ),
    ).rejects.toBeInstanceOf(DomainError)
    expect(settingQueries.upsertSetting).not.toHaveBeenCalled()
  })

  it('rejects maxAttempts of 0 (the deny-everyone footgun)', async () => {
    vi.mocked(settingQueries.findSettingsByScopePrefix).mockReturnValue([])

    await expect(
      updateBlogSettingsSection(
        db,
        'rateLimit',
        {
          signInIp: { windowSeconds: 1800, maxAttempts: 5 },
          commentPostIp: { windowSeconds: 3600, maxAttempts: 12 },
          commentPostEmail: { windowSeconds: 3600, maxAttempts: 8 },
          likeIncreaseIp: { windowSeconds: 3600, maxAttempts: 0 },
          inviteIp: { windowSeconds: 3600, maxAttempts: 5 },
          passwordResetIp: { windowSeconds: 1800, maxAttempts: 3 },
        },
        null,
      ),
    ).rejects.toBeInstanceOf(DomainError)
    expect(settingQueries.upsertSetting).not.toHaveBeenCalled()
  })

  it('merges a partial rateLimit patch into the stored row', async () => {
    const stored = bundleRows(fixtureBundle).find((row) => row.scope === 'blog.rateLimit')!
    vi.mocked(settingQueries.findSettingByScope).mockReturnValue(stored)
    vi.mocked(settingQueries.findSettingsByScopePrefix).mockReturnValue(bundleRows(fixtureBundle))
    vi.mocked(settingQueries.upsertSetting).mockReturnValue({
      id: 1,
      scope: 'blog.general',
      data: {},
      updatedAt: new Date(),
      updatedBy: null,
    } as Setting)

    await updateBlogSettingsSection(
      db,
      'rateLimit',
      {
        signInIp: { windowSeconds: 600, maxAttempts: 3 },
      },
      null,
    )

    const [, data, , scope] = vi.mocked(settingQueries.upsertSetting).mock.calls[0]
    expect(scope).toBe('blog.rateLimit')
    const row = data as Record<string, unknown>
    // The patched bucket is overwritten...
    expect(row.signInIp).toEqual({ windowSeconds: 600, maxAttempts: 3 })
    // ...and every bucket the patch omits survives from the stored row.
    expect(row.commentPostIp).toEqual(fixtureBundle.rateLimit!.commentPostIp)
    expect(row.likeIncreaseIp).toEqual(fixtureBundle.rateLimit!.likeIncreaseIp)
    expect(row.passkeyDeleteIp).toEqual(fixtureBundle.rateLimit!.passkeyDeleteIp)
  })
})

describe('services/settings — cache section', () => {
  it("writes a valid cache patch to scope='blog.cache' and refreshes the snapshot", async () => {
    vi.mocked(settingQueries.findSettingsByScopePrefix).mockReturnValue(bundleRows(fixtureBundle))
    vi.mocked(settingQueries.upsertSetting).mockReturnValue({
      id: 1,
      scope: 'blog.general',
      data: {},
      updatedAt: new Date(),
      updatedBy: null,
    } as Setting)

    await updateBlogSettingsSection(
      db,
      'cache',
      {
        cache: {
          og: { prefix: 'opengraph:', ttlSeconds: 60 * 60 * 24 * 14 },
          calendar: { prefix: 'cal:', ttlSeconds: 60 * 60 * 12 },
          avatar: { prefix: 'gravatar:', ttlSeconds: 60 * 60 * 24 * 3 },
          imageMeta: { prefix: 'image-meta:', ttlSeconds: 60 * 60 },
          searchResult: { prefix: 'search-result:', ttlSeconds: 60 * 60 },
        },
      },
      null,
    )

    const [, data, , scope] = vi.mocked(settingQueries.upsertSetting).mock.calls[0]
    expect(scope).toBe('blog.cache')
    const cache = (data as Record<string, unknown>).cache as Record<string, unknown>
    expect((cache.og as Record<string, unknown>).prefix).toBe('opengraph:')
    expect((cache.calendar as Record<string, unknown>).prefix).toBe('cal:')
    expect((cache.avatar as Record<string, unknown>).prefix).toBe('gravatar:')
  })

  it('rejects two buckets sharing the same prefix', async () => {
    vi.mocked(settingQueries.findSettingsByScopePrefix).mockReturnValue([])

    await expect(
      updateBlogSettingsSection(
        db,
        'cache',
        {
          cache: {
            og: { prefix: 'shared:', ttlSeconds: 60 * 60 },
            calendar: { prefix: 'shared:', ttlSeconds: 60 * 60 },
            avatar: { prefix: 'avatar:', ttlSeconds: 60 * 60 },
            imageMeta: { prefix: 'image-meta:', ttlSeconds: 60 * 60 },
          },
        },
        null,
      ),
    ).rejects.toBeInstanceOf(DomainError)
    expect(settingQueries.upsertSetting).not.toHaveBeenCalled()
  })

  it('rejects a bucket whose prefix is a strict prefix of another', async () => {
    vi.mocked(settingQueries.findSettingsByScopePrefix).mockReturnValue([])

    await expect(
      updateBlogSettingsSection(
        db,
        'cache',
        {
          cache: {
            og: { prefix: 'og:', ttlSeconds: 60 * 60 },
            calendar: { prefix: 'calendar:', ttlSeconds: 60 * 60 },
            // `og` is a strict prefix of `og:` — and fails the
            // must-end-with-`:` pattern, so the perimeter refuses it.
            avatar: { prefix: 'og', ttlSeconds: 60 * 60 },
            imageMeta: { prefix: 'image-meta:', ttlSeconds: 60 * 60 },
            searchResult: { prefix: 'search-result:', ttlSeconds: 60 * 60 },
          },
        },
        null,
      ),
    ).rejects.toBeInstanceOf(DomainError)
    expect(settingQueries.upsertSetting).not.toHaveBeenCalled()
  })

  it('rejects a prefix that collides with the reserved session: surface', async () => {
    vi.mocked(settingQueries.findSettingsByScopePrefix).mockReturnValue([])

    await expect(
      updateBlogSettingsSection(
        db,
        'cache',
        {
          cache: {
            og: { prefix: 'session:', ttlSeconds: 60 * 60 },
            calendar: { prefix: 'calendar:', ttlSeconds: 60 * 60 },
            avatar: { prefix: 'avatar:', ttlSeconds: 60 * 60 },
            imageMeta: { prefix: 'image-meta:', ttlSeconds: 60 * 60 },
          },
        },
        null,
      ),
    ).rejects.toBeInstanceOf(DomainError)
  })

  it('rejects a prefix that collides with the reserved rate-limit: surface', async () => {
    vi.mocked(settingQueries.findSettingsByScopePrefix).mockReturnValue([])

    await expect(
      updateBlogSettingsSection(
        db,
        'cache',
        {
          cache: {
            og: { prefix: 'rate-limit:', ttlSeconds: 60 * 60 },
            calendar: { prefix: 'calendar:', ttlSeconds: 60 * 60 },
            avatar: { prefix: 'avatar:', ttlSeconds: 60 * 60 },
            imageMeta: { prefix: 'image-meta:', ttlSeconds: 60 * 60 },
            searchResult: { prefix: 'search-result:', ttlSeconds: 60 * 60 },
          },
        },
        null,
      ),
    ).rejects.toBeInstanceOf(DomainError)
  })

  it('rejects a prefix that does not end with `:`', async () => {
    vi.mocked(settingQueries.findSettingsByScopePrefix).mockReturnValue([])

    await expect(
      updateBlogSettingsSection(
        db,
        'cache',
        {
          cache: {
            og: { prefix: 'ogkey', ttlSeconds: 60 * 60 },
            calendar: { prefix: 'calendar:', ttlSeconds: 60 * 60 },
            avatar: { prefix: 'avatar:', ttlSeconds: 60 * 60 },
            imageMeta: { prefix: 'image-meta:', ttlSeconds: 60 * 60 },
          },
        },
        null,
      ),
    ).rejects.toBeInstanceOf(DomainError)
  })

  it('rejects TTL below 1 hour or above 30 days', async () => {
    vi.mocked(settingQueries.findSettingsByScopePrefix).mockReturnValue([])

    await expect(
      updateBlogSettingsSection(
        db,
        'cache',
        {
          cache: {
            og: { prefix: 'og:', ttlSeconds: 60 },
            calendar: { prefix: 'calendar:', ttlSeconds: 60 * 60 },
            avatar: { prefix: 'avatar:', ttlSeconds: 60 * 60 },
            imageMeta: { prefix: 'image-meta:', ttlSeconds: 60 * 60 },
          },
        },
        null,
      ),
    ).rejects.toBeInstanceOf(DomainError)

    await expect(
      updateBlogSettingsSection(
        db,
        'cache',
        {
          cache: {
            og: { prefix: 'og:', ttlSeconds: 60 * 60 },
            calendar: { prefix: 'calendar:', ttlSeconds: 60 * 60 },
            avatar: { prefix: 'avatar:', ttlSeconds: 60 * 60 * 24 * 365 },
            imageMeta: { prefix: 'image-meta:', ttlSeconds: 60 * 60 },
          },
        },
        null,
      ),
    ).rejects.toBeInstanceOf(DomainError)
  })
})

describe('services/settings — security section', () => {
  it("writes the full security payload to scope='blog.security' verbatim", async () => {
    let currentRows = bundleRows(fixtureBundle)
    vi.mocked(settingQueries.findSettingsByScopePrefix).mockImplementation(() => currentRows)
    vi.mocked(settingQueries.upsertSetting).mockImplementation((_db, data, updatedBy, scope) => {
      currentRows = currentRows
        .filter((row) => row.scope !== scope)
        .concat([
          {
            id: 99,
            scope,
            data: data as Record<string, unknown>,
            updatedAt: new Date(),
            updatedBy,
          } as Setting,
        ])
      return { id: 99, scope, data: data as Record<string, unknown>, updatedAt: new Date(), updatedBy }
    })

    const next = await updateBlogSettingsSection(
      db,
      'security',
      {
        csrf: { enabled: true, exemptPaths: [] },
        cors: {
          enabled: true,
          origins: ['https://example.com', 'https://app.example.com'],
        },
      },
      null,
    )

    expect(settingQueries.upsertSetting).toHaveBeenCalledOnce()
    const [, data, , scope] = vi.mocked(settingQueries.upsertSetting).mock.calls[0]
    expect(scope).toBe('blog.security')
    expect((data as Record<string, unknown>).cors).toEqual({
      enabled: true,
      origins: ['https://example.com', 'https://app.example.com'],
    })
    expect(next?.security?.cors.enabled).toBe(true)
    expect(next?.security?.cors.origins).toEqual(['https://example.com', 'https://app.example.com'])
  })

  it('rejects an origin that is not a valid URL-like string (min length)', async () => {
    vi.mocked(settingQueries.findSettingsByScopePrefix).mockReturnValue([])

    await expect(
      updateBlogSettingsSection(
        db,
        'security',
        {
          csrf: { enabled: true, exemptPaths: [] },
          cors: {
            enabled: true,
            origins: [''],
          },
        },
        null,
      ),
    ).rejects.toBeInstanceOf(DomainError)
  })

  it('rejects more than 20 origins', async () => {
    vi.mocked(settingQueries.findSettingsByScopePrefix).mockReturnValue([])

    await expect(
      updateBlogSettingsSection(
        db,
        'security',
        {
          csrf: { enabled: true, exemptPaths: [] },
          cors: {
            enabled: true,
            origins: Array.from({ length: 21 }, (_, i) => `https://site${i}.example.com`),
          },
        },
        null,
      ),
    ).rejects.toBeInstanceOf(DomainError)
  })
})

describe('services/settings — section patch merge', () => {
  function mockStoredRow(scope: string, data: Record<string, unknown>): void {
    vi.mocked(settingQueries.findSettingByScope).mockReturnValue({
      id: 1,
      scope,
      data,
      updatedAt: new Date(),
      updatedBy: null,
    } as Setting)
    vi.mocked(settingQueries.findSettingsByScopePrefix).mockReturnValue(bundleRows(fixtureBundle))
    vi.mocked(settingQueries.upsertSetting).mockReturnValue({
      id: 1,
      scope: 'blog.general',
      data: {},
      updatedAt: new Date(),
      updatedBy: null,
    } as Setting)
  }

  it('keeps the stored SMTP TLS flags when a Zeabur-style patch only carries host', async () => {
    // Regression for the mail TLS drift: the loader projection may not
    // carry every field, so a focused patch must never reset the stored
    // row's untouched fields.
    mockStoredRow('blog.mail', {
      mail: {
        enabled: true,
        host: 'old.zeabur.com',
        apiKey: 'STORED-ZEABUR-KEY',
        sender: 'a@b.co',
        transport: 'smtp',
        smtpHost: 'smtp.example.com',
        smtpPort: 465,
        smtpUser: 'user',
        smtpSecure: true,
        smtpRequireTls: false,
        smtpRejectUnauthorized: false,
      },
    })

    await updateBlogSettingsSection(db, 'mail', { mail: { host: 'api.zeabur.com' } }, null)

    const [, data, , scope] = vi.mocked(settingQueries.upsertSetting).mock.calls[0]
    expect(scope).toBe('blog.mail')
    const mail = (data as Record<string, unknown>).mail as Record<string, unknown>
    expect(mail.host).toBe('api.zeabur.com')
    expect(mail.smtpSecure).toBe(true)
    expect(mail.smtpRequireTls).toBe(false)
    expect(mail.smtpRejectUnauthorized).toBe(false)
    expect(mail.transport).toBe('smtp')
    expect(String(mail.apiKey).startsWith('enc2:')).toBe(true)
  })

  it('rejects an unknown key inside a nested bucket with the issue list', async () => {
    const error = await updateBlogSettingsSection(
      db,
      'mail',
      { mail: { host: 'api.zeabur.com', bogus: 1 } },
      null,
    ).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(DomainError)
    expect((error as InstanceType<typeof DomainError>).code).toBe('BAD_REQUEST')
    expect((error as InstanceType<typeof DomainError>).issues).toEqual([
      { message: 'Unrecognized key: "bogus"', path: ['mail', 'bogus'] },
    ])
    expect(settingQueries.upsertSetting).not.toHaveBeenCalled()
  })

  it('rejects an unknown key at the section root with the issue list', async () => {
    const error = await updateBlogSettingsSection(db, 'mail', { bogus: {} }, null).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(DomainError)
    expect((error as InstanceType<typeof DomainError>).code).toBe('BAD_REQUEST')
    expect((error as InstanceType<typeof DomainError>).issues).toEqual([
      { message: 'Unrecognized key: "bogus"', path: ['bogus'] },
    ])
    expect(settingQueries.upsertSetting).not.toHaveBeenCalled()
  })

  it('replaces csrf.exemptPaths wholesale instead of concatenating', async () => {
    mockStoredRow('blog.security', {
      csrf: { enabled: true, exemptPaths: ['/webhook/github', '/webhook/stripe'] },
      cors: { enabled: false, origins: [] },
      passkey: { enabled: false },
    })

    await updateBlogSettingsSection(db, 'security', { csrf: { exemptPaths: ['/webhook/github'] } }, null)

    const [, data] = vi.mocked(settingQueries.upsertSetting).mock.calls[0]
    const csrf = (data as Record<string, unknown>).csrf as Record<string, unknown>
    expect(csrf.exemptPaths).toEqual(['/webhook/github'])
    expect(csrf.enabled).toBe(true)
  })

  it('replaces sidebar widgets wholesale (array of objects)', async () => {
    mockStoredRow('blog.sidebar', fixtureBundle.sidebar as unknown as Record<string, unknown>)

    await updateBlogSettingsSection(db, 'sidebar', { sidebar: { widgets: [{ type: 'search', enabled: false }] } }, null)

    const [, data] = vi.mocked(settingQueries.upsertSetting).mock.calls[0]
    const sidebar = (data as Record<string, unknown>).sidebar as Record<string, unknown>
    expect(sidebar.widgets).toEqual([{ type: 'search', enabled: false }])
  })

  it('merges a nested cors patch and preserves the sibling buckets', async () => {
    mockStoredRow('blog.security', {
      csrf: { enabled: true, exemptPaths: ['/webhook/github'] },
      cors: { enabled: false, origins: ['https://a.example.com', 'https://b.example.com'] },
      passkey: { enabled: false },
    })

    await updateBlogSettingsSection(db, 'security', { cors: { enabled: true } }, null)

    const [, data] = vi.mocked(settingQueries.upsertSetting).mock.calls[0]
    const row = data as Record<string, unknown>
    expect(row.cors).toEqual({ enabled: true, origins: ['https://a.example.com', 'https://b.example.com'] })
    expect(row.csrf).toEqual({ enabled: true, exemptPaths: ['/webhook/github'] })
    expect(row.passkey).toEqual({ enabled: false })
  })

  it('accepts a complete fonts payload and writes it verbatim', async () => {
    vi.mocked(settingQueries.findSettingByScope).mockReturnValue(null)
    vi.mocked(settingQueries.findSettingsByScopePrefix).mockReturnValue(bundleRows(fixtureBundle))
    vi.mocked(settingQueries.upsertSetting).mockReturnValue({
      id: 1,
      scope: 'blog.general',
      data: {},
      updatedAt: new Date(),
      updatedBy: null,
    } as Setting)
    // The fonts domain's setFontSlot path posts a full FontsSettings —
    // a complete object is a valid patch.
    const fontsPayload = {
      og: { family: 'NotoSansCJK' },
      calendar: { family: '' },
      global: ['3f6b9a1e-2f3c-4b1e-9f2a-7b1c0d2e4f5a'],
      post: [],
      code: ['1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d'],
    }

    await updateBlogSettingsSection(db, 'fonts', fontsPayload, null)

    const [, data, , scope] = vi.mocked(settingQueries.upsertSetting).mock.calls[0]
    expect(scope).toBe('blog.fonts')
    expect(data).toEqual(fontsPayload)
  })
})

describe('services/settings — snapshot reader', () => {
  it('getBlogSettingsBundleSync returns null when the slot is empty (pre-install)', () => {
    resetBlogSettingsForTests()
    expect(getBlogSettingsBundleSync()).toBeNull()
  })

  it('getBlogSettingsBundleSync echoes the hydrated bundle through the live snapshot', () => {
    const overridden: BlogSettingsBundle = {
      ...fixtureBundle,
      siteIdentity: { ...fixtureBundle.siteIdentity!, title: 'snapshot title' },
    }
    setBlogSettingsBundleForTests(overridden)

    const live = getBlogSettingsBundleSync()
    expect(live).not.toBeNull()
    expect(live?.siteIdentity?.title).toBe('snapshot title')
    expect(live?.assets?.asset.host).toBe('cdn.example.com')
    expect(live?.siteIdentity?.locale).toBe('zh-CN')
  })

  it('getCacheSettings() backfills missing bucket slots with fallbacks', () => {
    const legacyCache = {
      og: { prefix: 'legacy-og:', ttlSeconds: 1234 },
      calendar: { prefix: 'legacy-calendar:', ttlSeconds: 5678 },
      avatar: { prefix: 'legacy-avatar:', ttlSeconds: 4321 },
    } as unknown as NonNullable<BlogSettingsBundle['cache']>['cache']

    const legacyLikeBundle: BlogSettingsBundle = {
      ...fixtureBundle,
      cache: {
        cache: legacyCache,
      },
    }
    setBlogSettingsBundleForTests(legacyLikeBundle)

    const cache = getCacheSettings().cache
    expect(cache.og).toEqual({ prefix: 'legacy-og:', ttlSeconds: 1234 })
    expect(cache.calendar).toEqual({ prefix: 'legacy-calendar:', ttlSeconds: 5678 })
    expect(cache.avatar).toEqual({ prefix: 'legacy-avatar:', ttlSeconds: 4321 })
    expect(cache.imageMeta).toEqual({ prefix: 'image-meta:', ttlSeconds: 60 * 60 })
  })

  it('hydrate rejects legacy 3-bucket cache rows so the registry default backfills the section', async () => {
    // Reproduces the prod crash where a legacy `blog.cache` row stored
    // before `imageMeta` was added passed the old probe, then crashed
    // `<BucketCard>` on `allBuckets.imageMeta.prefix`.
    const legacyRow: Setting = {
      id: 99,
      scope: 'blog.cache',
      data: {
        cache: {
          og: { prefix: 'og:', ttlSeconds: 3600 },
          calendar: { prefix: 'calendar:', ttlSeconds: 3600 },
          avatar: { prefix: 'avatar:', ttlSeconds: 3600 },
        },
      } as unknown as Record<string, unknown>,
      updatedAt: new Date(),
      updatedBy: null,
    } as Setting
    const completeRows = bundleRows(fixtureBundle).filter((row) => row.scope !== 'blog.cache')
    vi.mocked(settingQueries.findSettingsByScopePrefix).mockReturnValue([...completeRows, legacyRow])
    vi.mocked(settingQueries.upsertSetting).mockReturnValue({
      id: 1,
      scope: 'blog.general',
      data: {},
      updatedAt: new Date(),
      updatedBy: null,
    } as Setting)

    const bundle = await hydrateBlogSettings(db)

    expect(bundle).not.toBeNull()
    const cache = bundle!.cache!.cache
    expect(cache.imageMeta).toEqual({ prefix: 'image-meta:', ttlSeconds: 60 * 60 })
    const upsertCalls = vi.mocked(settingQueries.upsertSetting).mock.calls
    expect(upsertCalls.some((call) => call[3] === 'blog.cache')).toBe(true)
  })
})
