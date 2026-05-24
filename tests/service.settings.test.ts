import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Setting } from '@/server/infra/db/types'
import type { BlogSettingsBundle } from '@/shared/config/blog'

vi.mock('@/server/infra/db/operations/setting', () => ({
  findSettingByScope: vi.fn(),
  findSettingsByScopePrefix: vi.fn(),
  upsertSetting: vi.fn(),
}))

import { flushWorkerRedis } from './_helpers/redis'

const settingQueries = await import('@/server/infra/db/operations/setting')
const { getAdminBlogSettings, updateBlogSettingsSection } = await import('@/server/domains/settings/service')
const { setBlogSettingsBundleForTests, getBlogSettingsBundleSync } = await import('@/server/domains/settings/snapshot')
const { DomainError } = await import('@/server/infra/http/errors')
const { getCacheSettings } = await import('@/shared/config/blog')

// Bucketed settings fixture. The on-disk DB stores one row per section
// (`blog.general`, `blog.assets`, …) so `bundleRows()` projects this
// fully-populated bundle into the per-row format that
// `findSettingsByScopePrefix` returns.
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
  // The merged `assets` bucket carries the music CDN host, the S3
  // storage credentials, and the upload limits. The fixture mirrors
  // the registry default for storage/upload (toggle OFF, every bucket
  // field empty) so the snapshot loader's lazy backfill stays a no-op
  // for these tests — leaving the section `null` here would make every
  // `updateBlogSettingsSection` call write TWO rows.
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
    },
  },
  comments: {
    comments: {
      size: 10,
      avatar: { mirror: 'https://cdn.example.com/avatar', size: 80 },
      tokenTtlSeconds: 1800,
    },
  },
  seo: {
    toc: { minHeadingLevel: 2, maxHeadingLevel: 4 },
    og: { width: 1200, height: 630 },
  },

  mail: { mail: { enabled: false, host: 'api.zeabur.com', apiKey: '', sender: 'noreply@example.com' } },
  cache: {
    cache: {
      og: { prefix: 'og:', ttlSeconds: 3600 },
      calendar: { prefix: 'calendar:', ttlSeconds: 3600 },
      avatar: { prefix: 'avatar:', ttlSeconds: 3600 },
      imageMeta: { prefix: 'image-meta:', ttlSeconds: 3600 },
      embeddingSearch: { prefix: 'embedding-search:', ttlSeconds: 60 * 60 * 24 * 7 },
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
  },
  search: {
    search: {
      enabled: false,
      mode: 'like',
      endpoint: '',
      apiKey: '',
      model: 'text-embedding-3-small',
      similarityThreshold: 0.5,
    },
  },
  fonts: {
    og: { url: '' },
    calendar: { url: '' },
    globalCss: [],
    postCss: [],
  },
  cors: { cors: { enabled: false, origins: [] } },
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
}

// Decompose the bundle into the actual `Setting[]` rows the DB would
// return — one row per non-null section, keyed by the registry scope.
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
    cache: 'blog.cache',
    rateLimit: 'blog.rateLimit',
    search: 'blog.search',
    fonts: 'blog.fonts',
    cors: 'blog.cors',
    limits: 'blog.limits',
  }
  const rows: Setting[] = []
  let id = 1n
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
  await flushWorkerRedis()
  vi.mocked(settingQueries.findSettingByScope).mockReset()
  vi.mocked(settingQueries.findSettingsByScopePrefix).mockReset()
  vi.mocked(settingQueries.upsertSetting).mockReset()
  setBlogSettingsBundleForTests(undefined)
})

describe('services/settings — getAdminBlogSettings', () => {
  it('returns null when no DB rows exist (pre-install)', async () => {
    vi.mocked(settingQueries.findSettingsByScopePrefix).mockResolvedValue([])

    const dto = await getAdminBlogSettings()

    expect(dto.bundle).toBeNull()
  })

  it('returns the assembled bundle when every section row passes schema validation', async () => {
    vi.mocked(settingQueries.findSettingsByScopePrefix).mockResolvedValue(bundleRows(fixtureBundle))

    const dto = await getAdminBlogSettings()

    expect(dto.bundle).not.toBeNull()
    expect(dto.bundle?.siteIdentity?.title).toBe(fixtureBundle.siteIdentity!.title)
    expect(dto.bundle?.sidebar?.sidebar.widgets[0].enabled).toBe(true)
  })

  it('treats a deployment as uninstalled when only some sections exist', async () => {
    // Only siteIdentity present; the snapshot module requires both
    // siteIdentity AND assets to consider the deployment installed.
    vi.mocked(settingQueries.findSettingsByScopePrefix).mockResolvedValue([
      {
        id: 1n,
        scope: 'blog.general',
        data: fixtureBundle.siteIdentity as unknown as Record<string, unknown>,
        updatedAt: new Date(),
        updatedBy: null,
      } as Setting,
    ])

    const dto = await getAdminBlogSettings()

    expect(dto.bundle).toBeNull()
  })
})

describe('services/settings — updateBlogSettingsSection', () => {
  it('rejects an invalid section payload with DomainError(400)', async () => {
    vi.mocked(settingQueries.findSettingsByScopePrefix).mockResolvedValue([])

    await expect(updateBlogSettingsSection('general', { title: '' }, null)).rejects.toBeInstanceOf(DomainError)
    expect(settingQueries.upsertSetting).not.toHaveBeenCalled()
  })

  it("writes the validated general payload (including locale + timeZone + timeFormat) to scope='blog.general' verbatim", async () => {
    // The mock has to react to the upsert so that the post-write
    // re-hydration sees the new value: the service writes through
    // `upsertSetting()`, then immediately calls
    // `findSettingsByScopePrefix()` to refresh the snapshot. Without
    // this projection the hydrate would return the *old* fixture and
    // the legacy aggregated wrapper would echo the stale title.
    let currentRows = bundleRows(fixtureBundle)
    vi.mocked(settingQueries.findSettingsByScopePrefix).mockImplementation(async () => currentRows)
    vi.mocked(settingQueries.upsertSetting).mockImplementation(async (data, updatedBy, scope) => {
      currentRows = currentRows
        .filter((row) => row.scope !== scope)
        .concat([
          {
            id: 99n,
            scope,
            data: data as Record<string, unknown>,
            updatedAt: new Date(),
            updatedBy,
          } as Setting,
        ])
      return { id: 99n, scope, data: data as Record<string, unknown>, updatedAt: new Date(), updatedBy }
    })

    const next = await updateBlogSettingsSection(
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
      42n,
    )

    expect(settingQueries.upsertSetting).toHaveBeenCalledOnce()
    const [data, updatedBy, scope] = vi.mocked(settingQueries.upsertSetting).mock.calls[0]
    expect(scope).toBe('blog.general')
    expect((data as Record<string, unknown>).title).toBe('雨帆')
    // The row contents are the validated payload verbatim — no legacy
    // `settings` nesting.
    expect((data as Record<string, unknown>).settings).toBeUndefined()
    expect(updatedBy).toBe(42n)
    // The service now returns the refreshed bundle; the bucket
    // corresponding to the saved section echoes the persisted payload.
    expect(next?.siteIdentity?.title).toBe('雨帆')
  })

  it("writes the assets patch to scope='blog.assets' only and preserves the unchanged secret", async () => {
    // Seed the existing row with a non-empty secret so the
    // "secretAccessKey omitted ⇒ keep existing" branch in
    // `applyAssetsPatch` has something to copy back.
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
    vi.mocked(settingQueries.findSettingByScope).mockResolvedValueOnce(
      existing.find((row) => row.scope === 'blog.assets')!,
    )
    vi.mocked(settingQueries.findSettingsByScopePrefix).mockResolvedValue(existing)
    vi.mocked(settingQueries.upsertSetting).mockResolvedValue({
      id: 1n,
      scope: 'blog.general',
      data: {},
      updatedAt: new Date(),
      updatedBy: null,
    } as Setting)

    await updateBlogSettingsSection(
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

    const [data, , scope] = vi.mocked(settingQueries.upsertSetting).mock.calls[0]
    expect(scope).toBe('blog.assets')
    const payload = data as Record<string, unknown>
    expect(payload.asset).toEqual({ host: 'cdn.test.example', scheme: 'https' })
    const storage = payload.storage as Record<string, unknown>
    expect(storage.secretAccessKey).toBe('STORED')
    expect(settingQueries.findSettingByScope).toHaveBeenCalledWith('blog.assets')
  })

  it('does not read the rest of the document when patching a single section (write isolation)', async () => {
    vi.mocked(settingQueries.findSettingsByScopePrefix).mockResolvedValue(bundleRows(fixtureBundle))
    vi.mocked(settingQueries.upsertSetting).mockResolvedValue({
      id: 1n,
      scope: 'blog.general',
      data: {},
      updatedAt: new Date(),
      updatedBy: null,
    } as Setting)

    await updateBlogSettingsSection(
      'navigation',
      { navigation: { sideNav: [{ text: 'Home', link: '/' }], footerNav: [] } },
      null,
    )

    // The non-mail path never queries the existing row — the bug the
    // refactor fixed (`SELECT ... merge ... UPSERT` racing concurrent
    // edits) is no longer reachable.
    expect(settingQueries.findSettingByScope).not.toHaveBeenCalled()

    const [data, , scope] = vi.mocked(settingQueries.upsertSetting).mock.calls[0]
    expect(scope).toBe('blog.navigation')
    expect((data as Record<string, unknown>).navigation).toEqual({
      sideNav: [{ text: 'Home', link: '/' }],
      footerNav: [],
    })
  })
})

describe('services/settings — mail section', () => {
  it("writes the full mail patch to scope='blog.mail' when an apiKey is provided", async () => {
    // The non-omitted-apiKey path doesn't read the existing row.
    vi.mocked(settingQueries.findSettingsByScopePrefix).mockResolvedValue(bundleRows(fixtureBundle))
    vi.mocked(settingQueries.upsertSetting).mockResolvedValue({
      id: 1n,
      scope: 'blog.general',
      data: {},
      updatedAt: new Date(),
      updatedBy: null,
    } as Setting)

    await updateBlogSettingsSection(
      'mail',
      {
        mail: {
          enabled: true,
          host: 'api.zeabur.com',
          apiKey: 'NEWKEY',
          sender: 'noreply@example.com',
        },
      },
      null,
    )

    const [data, , scope] = vi.mocked(settingQueries.upsertSetting).mock.calls[0]
    expect(scope).toBe('blog.mail')
    const mail = (data as Record<string, unknown>).mail as Record<string, unknown>
    expect(mail).toEqual({
      enabled: true,
      host: 'api.zeabur.com',
      apiKey: 'NEWKEY',
      sender: 'noreply@example.com',
    })
    // The mail-section's "preserve existing apiKey" branch is the only
    // one that reads back; supplying an explicit key skips it.
    expect(settingQueries.findSettingByScope).not.toHaveBeenCalled()
  })

  it("preserves the existing apiKey by reading scope='blog.mail' when omitted", async () => {
    vi.mocked(settingQueries.findSettingByScope).mockResolvedValueOnce({
      id: 1n,
      scope: 'blog.mail',
      data: {
        mail: { enabled: true, host: 'old.example.com', apiKey: 'STORED', sender: 'a@b.co' },
      },
      updatedAt: new Date(),
      updatedBy: null,
    } as Setting)
    vi.mocked(settingQueries.findSettingsByScopePrefix).mockResolvedValue(bundleRows(fixtureBundle))
    vi.mocked(settingQueries.upsertSetting).mockResolvedValue({
      id: 1n,
      scope: 'blog.general',
      data: {},
      updatedAt: new Date(),
      updatedBy: null,
    } as Setting)

    await updateBlogSettingsSection(
      'mail',
      {
        mail: { enabled: true, host: 'api.zeabur.com', sender: 'noreply@example.com' },
      },
      null,
    )

    // The keep-existing branch fetches ONLY the mail row; no other
    // section's row is touched.
    expect(settingQueries.findSettingByScope).toHaveBeenCalledExactlyOnceWith('blog.mail')
    const [data] = vi.mocked(settingQueries.upsertSetting).mock.calls[0]
    const mail = (data as Record<string, unknown>).mail as Record<string, unknown>
    expect(mail.apiKey).toBe('STORED')
    expect(mail.host).toBe('api.zeabur.com')
    expect(mail.sender).toBe('noreply@example.com')
    expect(mail.enabled).toBe(true)
  })

  it('rejects a sender that is not a valid email', async () => {
    vi.mocked(settingQueries.findSettingsByScopePrefix).mockResolvedValue([])

    await expect(
      updateBlogSettingsSection(
        'mail',
        { mail: { enabled: false, host: 'api.zeabur.com', apiKey: '', sender: 'not-an-email' } },
        null,
      ),
    ).rejects.toBeInstanceOf(DomainError)
    expect(settingQueries.upsertSetting).not.toHaveBeenCalled()
  })
})

describe('services/settings — rateLimit section', () => {
  it("writes a valid rateLimit patch to scope='blog.rateLimit' verbatim", async () => {
    let currentRows = bundleRows(fixtureBundle)
    vi.mocked(settingQueries.findSettingsByScopePrefix).mockImplementation(async () => currentRows)
    vi.mocked(settingQueries.upsertSetting).mockImplementation(async (data, updatedBy, scope) => {
      currentRows = currentRows
        .filter((row) => row.scope !== scope)
        .concat([
          {
            id: 99n,
            scope,
            data: data as Record<string, unknown>,
            updatedAt: new Date(),
            updatedBy,
          } as Setting,
        ])
      return { id: 99n, scope, data: data as Record<string, unknown>, updatedAt: new Date(), updatedBy }
    })

    const next = await updateBlogSettingsSection(
      'rateLimit',
      {
        signInIp: { windowSeconds: 600, maxAttempts: 3 },
        commentPostIp: { windowSeconds: 60 * 30, maxAttempts: 6 },
        commentPostEmail: { windowSeconds: 60 * 30, maxAttempts: 4 },
        likeIncreaseIp: { windowSeconds: 60 * 5, maxAttempts: 100 },
        inviteIp: { windowSeconds: 60 * 60, maxAttempts: 5 },
        inviteEmail: { windowSeconds: 60 * 60, maxAttempts: 1 },
        passwordResetIp: { windowSeconds: 60 * 30, maxAttempts: 3 },
        passwordResetEmail: { windowSeconds: 60 * 5, maxAttempts: 1 },
        passwordResetTarget: { windowSeconds: 60, maxAttempts: 1 },
        resourceIp: { windowSeconds: 60, maxAttempts: 60 },
      },
      11n,
    )

    const [data, updatedBy, scope] = vi.mocked(settingQueries.upsertSetting).mock.calls[0]
    expect(scope).toBe('blog.rateLimit')
    expect(updatedBy).toBe(11n)
    expect(data).toMatchObject({
      signInIp: { windowSeconds: 600, maxAttempts: 3 },
      likeIncreaseIp: { windowSeconds: 60 * 5, maxAttempts: 100 },
    })
    // The post-write refresh round-trips through the same fixture, so
    // the returned bundle echoes the saved bucket.
    expect(next?.rateLimit?.signInIp).toEqual({ windowSeconds: 600, maxAttempts: 3 })
  })

  it('rejects a window shorter than 60s', async () => {
    vi.mocked(settingQueries.findSettingsByScopePrefix).mockResolvedValue([])

    await expect(
      updateBlogSettingsSection(
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
    vi.mocked(settingQueries.findSettingsByScopePrefix).mockResolvedValue([])

    await expect(
      updateBlogSettingsSection(
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

  it('rejects a payload missing one of the four buckets', async () => {
    vi.mocked(settingQueries.findSettingsByScopePrefix).mockResolvedValue([])

    await expect(
      updateBlogSettingsSection(
        'rateLimit',
        {
          signInIp: { windowSeconds: 1800, maxAttempts: 5 },
          commentPostIp: { windowSeconds: 3600, maxAttempts: 12 },
          commentPostEmail: { windowSeconds: 3600, maxAttempts: 8 },
          inviteIp: { windowSeconds: 3600, maxAttempts: 5 },
          passwordResetIp: { windowSeconds: 1800, maxAttempts: 3 },
          // likeIncreaseIp deliberately omitted
        },
        null,
      ),
    ).rejects.toBeInstanceOf(DomainError)
    expect(settingQueries.upsertSetting).not.toHaveBeenCalled()
  })
})

describe('services/settings — cache section', () => {
  it("writes a valid cache patch to scope='blog.cache' and refreshes the snapshot", async () => {
    vi.mocked(settingQueries.findSettingsByScopePrefix).mockResolvedValue(bundleRows(fixtureBundle))
    vi.mocked(settingQueries.upsertSetting).mockResolvedValue({
      id: 1n,
      scope: 'blog.general',
      data: {},
      updatedAt: new Date(),
      updatedBy: null,
    } as Setting)

    await updateBlogSettingsSection(
      'cache',
      {
        cache: {
          og: { prefix: 'opengraph:', ttlSeconds: 60 * 60 * 24 * 14 },
          calendar: { prefix: 'cal:', ttlSeconds: 60 * 60 * 12 },
          avatar: { prefix: 'gravatar:', ttlSeconds: 60 * 60 * 24 * 3 },
          imageMeta: { prefix: 'image-meta:', ttlSeconds: 60 * 60 },
          embeddingSearch: { prefix: 'embedding-search:', ttlSeconds: 60 * 60 * 24 * 7 },
          searchResult: { prefix: 'search-result:', ttlSeconds: 60 * 60 },
        },
      },
      null,
    )

    const [data, , scope] = vi.mocked(settingQueries.upsertSetting).mock.calls[0]
    expect(scope).toBe('blog.cache')
    const cache = (data as Record<string, unknown>).cache as Record<string, unknown>
    expect((cache.og as Record<string, unknown>).prefix).toBe('opengraph:')
    expect((cache.calendar as Record<string, unknown>).prefix).toBe('cal:')
    expect((cache.avatar as Record<string, unknown>).prefix).toBe('gravatar:')
  })

  it('rejects two buckets sharing the same prefix', async () => {
    vi.mocked(settingQueries.findSettingsByScopePrefix).mockResolvedValue([])

    await expect(
      updateBlogSettingsSection(
        'cache',
        {
          cache: {
            og: { prefix: 'shared:', ttlSeconds: 60 * 60 },
            calendar: { prefix: 'shared:', ttlSeconds: 60 * 60 },
            avatar: { prefix: 'avatar:', ttlSeconds: 60 * 60 },
            imageMeta: { prefix: 'image-meta:', ttlSeconds: 60 * 60 },
            embeddingSearch: { prefix: 'embedding-search:', ttlSeconds: 60 * 60 * 24 * 7 },
          },
        },
        null,
      ),
    ).rejects.toBeInstanceOf(DomainError)
    expect(settingQueries.upsertSetting).not.toHaveBeenCalled()
  })

  it('rejects a bucket whose prefix is a strict prefix of another', async () => {
    vi.mocked(settingQueries.findSettingsByScopePrefix).mockResolvedValue([])

    await expect(
      updateBlogSettingsSection(
        'cache',
        {
          cache: {
            og: { prefix: 'og:', ttlSeconds: 60 * 60 },
            calendar: { prefix: 'calendar:', ttlSeconds: 60 * 60 },
            avatar: { prefix: 'og-foo:', ttlSeconds: 60 * 60 },
            imageMeta: { prefix: 'image-meta:', ttlSeconds: 60 * 60 },
            embeddingSearch: { prefix: 'embedding-search:', ttlSeconds: 60 * 60 * 24 * 7 },
          },
        },
        null,
      ),
    ).rejects.toBeInstanceOf(DomainError)
    expect(settingQueries.upsertSetting).not.toHaveBeenCalled()
  })

  it('rejects a prefix that collides with the reserved session: surface', async () => {
    vi.mocked(settingQueries.findSettingsByScopePrefix).mockResolvedValue([])

    await expect(
      updateBlogSettingsSection(
        'cache',
        {
          cache: {
            og: { prefix: 'session:', ttlSeconds: 60 * 60 },
            calendar: { prefix: 'calendar:', ttlSeconds: 60 * 60 },
            avatar: { prefix: 'avatar:', ttlSeconds: 60 * 60 },
            imageMeta: { prefix: 'image-meta:', ttlSeconds: 60 * 60 },
            embeddingSearch: { prefix: 'embedding-search:', ttlSeconds: 60 * 60 * 24 * 7 },
          },
        },
        null,
      ),
    ).rejects.toBeInstanceOf(DomainError)
  })

  it('rejects a prefix that collides with the reserved rate-limit: surface', async () => {
    vi.mocked(settingQueries.findSettingsByScopePrefix).mockResolvedValue([])

    await expect(
      updateBlogSettingsSection(
        'cache',
        {
          cache: {
            og: { prefix: 'rate:', ttlSeconds: 60 * 60 },
            calendar: { prefix: 'calendar:', ttlSeconds: 60 * 60 },
            avatar: { prefix: 'avatar:', ttlSeconds: 60 * 60 },
            imageMeta: { prefix: 'image-meta:', ttlSeconds: 60 * 60 },
            embeddingSearch: { prefix: 'embedding-search:', ttlSeconds: 60 * 60 * 24 * 7 },
          },
        },
        null,
      ),
    ).rejects.toBeInstanceOf(DomainError)
  })

  it('rejects a prefix that does not end with `:`', async () => {
    vi.mocked(settingQueries.findSettingsByScopePrefix).mockResolvedValue([])

    await expect(
      updateBlogSettingsSection(
        'cache',
        {
          cache: {
            og: { prefix: 'ogkey', ttlSeconds: 60 * 60 },
            calendar: { prefix: 'calendar:', ttlSeconds: 60 * 60 },
            avatar: { prefix: 'avatar:', ttlSeconds: 60 * 60 },
            imageMeta: { prefix: 'image-meta:', ttlSeconds: 60 * 60 },
            embeddingSearch: { prefix: 'embedding-search:', ttlSeconds: 60 * 60 * 24 * 7 },
          },
        },
        null,
      ),
    ).rejects.toBeInstanceOf(DomainError)
  })

  it('rejects TTL below 1 hour or above 30 days', async () => {
    vi.mocked(settingQueries.findSettingsByScopePrefix).mockResolvedValue([])

    await expect(
      updateBlogSettingsSection(
        'cache',
        {
          cache: {
            og: { prefix: 'og:', ttlSeconds: 60 },
            calendar: { prefix: 'calendar:', ttlSeconds: 60 * 60 },
            avatar: { prefix: 'avatar:', ttlSeconds: 60 * 60 },
            imageMeta: { prefix: 'image-meta:', ttlSeconds: 60 * 60 },
            embeddingSearch: { prefix: 'embedding-search:', ttlSeconds: 60 * 60 * 24 * 7 },
          },
        },
        null,
      ),
    ).rejects.toBeInstanceOf(DomainError)

    await expect(
      updateBlogSettingsSection(
        'cache',
        {
          cache: {
            og: { prefix: 'og:', ttlSeconds: 60 * 60 },
            calendar: { prefix: 'calendar:', ttlSeconds: 60 * 60 },
            avatar: { prefix: 'avatar:', ttlSeconds: 60 * 60 * 24 * 365 },
            imageMeta: { prefix: 'image-meta:', ttlSeconds: 60 * 60 },
            embeddingSearch: { prefix: 'embedding-search:', ttlSeconds: 60 * 60 * 24 * 7 },
          },
        },
        null,
      ),
    ).rejects.toBeInstanceOf(DomainError)
  })
})

describe('services/settings — cors section', () => {
  it("writes the full cors payload to scope='blog.cors' verbatim", async () => {
    let currentRows = bundleRows(fixtureBundle)
    vi.mocked(settingQueries.findSettingsByScopePrefix).mockImplementation(async () => currentRows)
    vi.mocked(settingQueries.upsertSetting).mockImplementation(async (data, updatedBy, scope) => {
      currentRows = currentRows
        .filter((row) => row.scope !== scope)
        .concat([
          {
            id: 99n,
            scope,
            data: data as Record<string, unknown>,
            updatedAt: new Date(),
            updatedBy,
          } as Setting,
        ])
      return { id: 99n, scope, data: data as Record<string, unknown>, updatedAt: new Date(), updatedBy }
    })

    const next = await updateBlogSettingsSection(
      'cors',
      {
        cors: {
          enabled: true,
          origins: ['https://example.com', 'https://app.example.com'],
        },
      },
      null,
    )

    expect(settingQueries.upsertSetting).toHaveBeenCalledOnce()
    const [data, , scope] = vi.mocked(settingQueries.upsertSetting).mock.calls[0]
    expect(scope).toBe('blog.cors')
    expect((data as Record<string, unknown>).cors).toEqual({
      enabled: true,
      origins: ['https://example.com', 'https://app.example.com'],
    })
    expect(next?.cors?.cors.enabled).toBe(true)
    expect(next?.cors?.cors.origins).toEqual(['https://example.com', 'https://app.example.com'])
  })

  it('rejects an origin that is not a valid URL-like string (min length)', async () => {
    vi.mocked(settingQueries.findSettingsByScopePrefix).mockResolvedValue([])

    await expect(
      updateBlogSettingsSection(
        'cors',
        {
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
    vi.mocked(settingQueries.findSettingsByScopePrefix).mockResolvedValue([])

    await expect(
      updateBlogSettingsSection(
        'cors',
        {
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

describe('services/settings — snapshot reader', () => {
  it('getBlogSettingsBundleSync returns null when the slot is empty (pre-install)', () => {
    setBlogSettingsBundleForTests(undefined)
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
    expect(cache.embeddingSearch).toEqual({
      prefix: 'embedding-search:',
      ttlSeconds: 60 * 60 * 24 * 7,
    })
    expect(cache.embeddingSearch).toEqual({
      prefix: 'embedding-search:',
      ttlSeconds: 60 * 60 * 24 * 7,
    })
  })

  it('hydrate rejects legacy 3-bucket cache rows so the registry default backfills the section', async () => {
    // Reproduces the prod crash where a legacy `blog.cache` row stored
    // before `imageMeta` was added passed the old
    // (object-only) probe, then crashed `<BucketCard>` on
    // `allBuckets.imageMeta.prefix`. The strengthened probe rejects
    // the row, the bucket is left null after the SELECT pass, and the
    // backfill path writes the registry default in its place.
    const legacyRow: Setting = {
      id: 99n,
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
    vi.mocked(settingQueries.findSettingsByScopePrefix).mockResolvedValue([...completeRows, legacyRow])
    vi.mocked(settingQueries.upsertSetting).mockResolvedValue({
      id: 1n,
      scope: 'blog.general',
      data: {},
      updatedAt: new Date(),
      updatedBy: null,
    } as Setting)

    const dto = await getAdminBlogSettings()

    expect(dto.bundle).not.toBeNull()
    const cache = dto.bundle!.cache!.cache
    expect(cache.imageMeta).toEqual({ prefix: 'image-meta:', ttlSeconds: 60 * 60 })
    const upsertCalls = vi.mocked(settingQueries.upsertSetting).mock.calls
    expect(upsertCalls.some((call) => call[2] === 'blog.cache')).toBe(true)
  })
})
