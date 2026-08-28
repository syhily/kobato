import { beforeEach, describe, expect, it } from 'vitest'

import type { Database } from '@/server/infra/db/database'
import type { BlogSettingsBundle } from '@/shared/config/types'

import { resetBlogSettingsForTests, setBlogSettingsBundleForTests } from '#/_helpers/blog-settings'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { updateBlogSettingsSection } from '@/server/domains/settings/services/core'
import { hydrateBlogSettings } from '@/server/domains/settings/services/hydrate'
import { __clearSectionChangeHandlersForTests } from '@/server/domains/settings/services/section-changes'
import { decryptIfNeeded } from '@/server/infra/crypto/secret-encryption'
import { findSettingByScope } from '@/server/infra/db/operations/setting'
import { setting } from '@/server/infra/db/schema/config'
import { DomainError } from '@/server/infra/http/errors'
import { getBlogSettingsBundleSync } from '@/shared/config/getters'

// Real in-memory engine for reads/merge/UPSERT/encryption/snapshot;
// only the section-change dispatch stays with the unit tests.
const db: Database = getTestDb()

// The DB stores one row per section; seedSections() projects this bundle into per-scope rows.
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
      avatar: { mirror: 'https://gravatar.com/avatar/', sources: ['qq', 'github', 'gravatar'] },
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
    analytics: { trackAdmin: false, keepBotRows: false, geoipAutoUpdate: false },
  },
  security: {
    csrf: { enabled: true, exemptPaths: [] },
    cors: { enabled: false, origins: [] },
    passkey: { enabled: false },
  },
  webmentions: {
    webmention: { receiveEnabled: true, displayOnPosts: true },
  },
}

const BUNDLE_SCOPES: Record<keyof BlogSettingsBundle, string> = {
  siteIdentity: 'blog.general',
  assets: 'blog.assets',
  backup: 'blog.backup',
  navigation: 'blog.navigation',
  socials: 'blog.socials',
  content: 'blog.content',
  sidebar: 'blog.sidebar',
  comments: 'blog.comments',
  webmentions: 'blog.webmentions',
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

/**
 * Seed the fixture bundle as per-scope rows; `except` skips scopes, `override` swaps a scope's payload.
 */
async function seedSections(
  bundle: BlogSettingsBundle = fixtureBundle,
  opts: { except?: string[]; override?: Record<string, Record<string, unknown>> } = {},
): Promise<void> {
  for (const key of Object.keys(BUNDLE_SCOPES) as (keyof BlogSettingsBundle)[]) {
    const scope = BUNDLE_SCOPES[key]
    if (opts.except?.includes(scope)) {
      continue
    }
    const data = opts.override?.[scope] ?? (bundle[key] as unknown as Record<string, unknown> | null)
    if (data === null) {
      continue
    }
    await db.insert(setting).values({ scope, data })
  }
}

function readRow(scope: string) {
  const row = findSettingByScope(db, scope)
  expect(row).not.toBeNull()
  return row!
}

function readBucket(scope: string, bucket: string): Record<string, unknown> {
  return (readRow(scope).data as Record<string, unknown>)[bucket] as Record<string, unknown>
}

beforeEach(async () => {
  __clearSectionChangeHandlersForTests()
  await clearAllTables(db)
  resetBlogSettingsForTests()
})

describe('services/settings — hydrateBlogSettings', () => {
  it('returns null when no DB rows exist (pre-install)', async () => {
    const bundle = await hydrateBlogSettings(db)

    expect(bundle).toBeNull()
  })

  it('returns the assembled bundle when every section row passes schema validation', async () => {
    await seedSections()

    const bundle = await hydrateBlogSettings(db)

    expect(bundle).not.toBeNull()
    expect(bundle?.siteIdentity?.title).toBe(fixtureBundle.siteIdentity!.title)
    expect(bundle?.sidebar?.sidebar.widgets[0].enabled).toBe(true)
  })

  it('treats a deployment as uninstalled when only some sections exist', async () => {
    // The snapshot requires both siteIdentity AND assets to consider the deployment installed.
    await db.insert(setting).values({
      scope: 'blog.general',
      data: fixtureBundle.siteIdentity as unknown as Record<string, unknown>,
    })

    const bundle = await hydrateBlogSettings(db)

    expect(bundle).toBeNull()
  })

  it('names the failing secret field when a stored secret cannot be decrypted', async () => {
    // Well-formed enc2: ciphertext the configured key can't authenticate;
    // the error must name the failing secret field.
    const undecryptable = 'enc2:' + '00'.repeat(12) + ':' + '00'.repeat(16) + ':' + '00'.repeat(16)
    await seedSections(fixtureBundle, {
      override: {
        'blog.mail': {
          mail: { ...(fixtureBundle.mail!.mail as Record<string, unknown>), apiKey: undecryptable },
        },
      },
    })

    await expect(hydrateBlogSettings(db)).rejects.toThrow(/Failed to decrypt secret setting 'mail\.mail\.apiKey'/)
  })
})

describe('services/settings — updateBlogSettingsSection', () => {
  it('rejects an invalid section payload with DomainError(400) and writes nothing', async () => {
    await expect(updateBlogSettingsSection(db, 'general', { title: '' }, null)).rejects.toBeInstanceOf(DomainError)
    expect(findSettingByScope(db, 'blog.general')).toBeNull()
  })

  it("writes the validated general payload to scope='blog.general' verbatim", async () => {
    await seedSections()

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

    const row = readRow('blog.general')
    expect(row.updatedBy).toBe(42)
    const data = row.data as Record<string, unknown>
    expect(data.title).toBe('雨帆')
    expect(data.settings).toBeUndefined()
    expect(next.bundle?.siteIdentity?.title).toBe('雨帆')
  })

  it("writes the assets patch to scope='blog.assets' only and preserves the unchanged secret", async () => {
    await seedSections(fixtureBundle, {
      override: {
        'blog.assets': {
          ...(fixtureBundle.assets as unknown as Record<string, unknown>),
          storage: {
            ...(fixtureBundle.assets!.storage as unknown as Record<string, unknown>),
            secretAccessKey: 'STORED',
          },
        },
      },
    })

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

    const row = readRow('blog.assets')
    const payload = row.data as Record<string, unknown>
    expect(payload.asset).toEqual({ host: 'cdn.test.example', scheme: 'https' })
    // The omitted secret survived the patch, routed through encryptSecretsInRow like any plaintext.
    const storage = payload.storage as Record<string, unknown>
    expect(storage.secretAccessKey).toMatch(/^enc2:/)
    expect(decryptIfNeeded(storage.secretAccessKey as string)).toBe('STORED')
  })

  it('writes only its own section row when patching a single section (write isolation)', async () => {
    await seedSections()
    const mailBefore = readRow('blog.mail').data

    await updateBlogSettingsSection(
      db,
      'navigation',
      { navigation: { sideNav: [{ text: 'Home', link: '/' }], footerNav: [] } },
      null,
    )

    const row = readRow('blog.navigation')
    expect((row.data as Record<string, unknown>).navigation).toEqual({
      sideNav: [{ text: 'Home', link: '/' }],
      footerNav: [],
    })
    expect(readRow('blog.mail').data).toEqual(mailBefore)
  })
})

describe('services/settings — mail section', () => {
  it("writes the full mail patch to scope='blog.mail' and encrypts every provided secret", async () => {
    await seedSections()

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

    const mail = readBucket('blog.mail', 'mail')
    expect(mail.enabled).toBe(true)
    expect(mail.host).toBe('api.zeabur.com')
    expect(mail.apiKey).toMatch(/^enc2:/)
    expect(decryptIfNeeded(mail.apiKey as string)).toBe('NEWKEY')
    expect(mail.smtpPass).toMatch(/^enc2:/)
    expect(decryptIfNeeded(mail.smtpPass as string)).toBe('NEWSMTPPASS')
    expect(mail.mailgunApiKey).toMatch(/^enc2:/)
    expect(decryptIfNeeded(mail.mailgunApiKey as string)).toBe('NEWMAILGUNKEY')
    expect(mail.sender).toBe('noreply@example.com')
  })

  it('rejects a sender that is not a valid email and writes nothing', async () => {
    await expect(
      updateBlogSettingsSection(
        db,
        'mail',
        { mail: { enabled: false, host: 'api.zeabur.com', apiKey: '', sender: 'not-an-email' } },
        null,
      ),
    ).rejects.toBeInstanceOf(DomainError)
    expect(findSettingByScope(db, 'blog.mail')).toBeNull()
  })

  it("preserves the existing smtpPass by reading scope='blog.mail' when omitted", async () => {
    await seedSections(fixtureBundle, {
      except: ['blog.mail'],
      override: {},
    })
    await db.insert(setting).values({
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
    })

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

    const mail = readBucket('blog.mail', 'mail')
    // smtpPass omitted from the patch: preserved from the stored row, then encrypted.
    expect(mail.smtpPass).toMatch(/^enc2:/)
    expect(decryptIfNeeded(mail.smtpPass as string)).toBe('STOREDSMTPPASS')
    expect(mail.smtpHost).toBe('smtp.example.com')
    expect(mail.smtpUser).toBe('user')
    expect(mail.smtpSecure).toBe(true)
    // apiKey preserved and re-encrypted — every mail secret routes through encryptSecretsInRow.
    expect(mail.apiKey).toMatch(/^enc2:/)
    expect(decryptIfNeeded(mail.apiKey as string)).toBe('ZEABURKEY')
  })

  it("preserves the existing mailgunApiKey by reading scope='blog.mail' when omitted", async () => {
    await seedSections(fixtureBundle, { except: ['blog.mail'] })
    await db.insert(setting).values({
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
    })

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

    const mail = readBucket('blog.mail', 'mail')
    expect(mail.mailgunDomain).toBe('mg.example.com')
    expect(mail.sender).toBe('noreply@mg.example.com')
    // mailgunApiKey omitted from the patch and preserved from the existing row.
    expect(mail.mailgunApiKey).toMatch(/^enc2:/)
    expect(decryptIfNeeded(mail.mailgunApiKey as string)).toBe('STOREDMAILGUNKEY')
    expect(mail.apiKey).toMatch(/^enc2:/)
    expect(decryptIfNeeded(mail.apiKey as string)).toBe('ZEABURKEY')
  })
})

describe('services/settings — comments section', () => {
  it("writes the avatar patch to scope='blog.comments' with replace semantics for sources and encrypts the githubToken", async () => {
    await seedSections()

    await updateBlogSettingsSection(
      db,
      'comments',
      {
        comments: {
          avatar: { mirror: 'https://gravatar.com/avatar/', sources: ['github', 'gravatar', 'qq'] },
          githubToken: 'NEWGITHUBTOKEN',
        },
      },
      null,
    )

    const comments = readBucket('blog.comments', 'comments')
    const avatar = comments.avatar as Record<string, unknown>
    // Arrays replace, never concatenate.
    expect(avatar.sources).toEqual(['github', 'gravatar', 'qq'])
    expect(comments.githubToken).toMatch(/^enc2:/)
    expect(decryptIfNeeded(comments.githubToken as string)).toBe('NEWGITHUBTOKEN')
  })

  it('preserves the stored githubToken when the patch omits it', async () => {
    await seedSections(fixtureBundle, { except: ['blog.comments'] })
    await db.insert(setting).values({
      scope: 'blog.comments',
      data: {
        comments: {
          size: 10,
          avatar: { mirror: 'https://gravatar.com/avatar/', sources: ['qq', 'github', 'gravatar'] },
          githubToken: 'STOREDGITHUBTOKEN',
          tokenTtlSeconds: 1800,
        },
      },
    })

    await updateBlogSettingsSection(db, 'comments', { comments: { avatar: { sources: ['gravatar'] } } }, null)

    const comments = readBucket('blog.comments', 'comments')
    // githubToken omitted from the patch: preserved from the stored row, then encrypted.
    expect(comments.githubToken).toMatch(/^enc2:/)
    expect(decryptIfNeeded(comments.githubToken as string)).toBe('STOREDGITHUBTOKEN')
    const avatar = comments.avatar as Record<string, unknown>
    expect(avatar.sources).toEqual(['gravatar'])
    // Untouched avatar keys survive the sparse patch (deep-merge).
    expect(avatar.mirror).toBe('https://gravatar.com/avatar/')
  })

  it('hydrates a legacy row without avatar.sources with the schema default', async () => {
    await seedSections(fixtureBundle, { except: ['blog.comments'] })
    await db.insert(setting).values({
      scope: 'blog.comments',
      data: {
        comments: {
          size: 10,
          avatar: { mirror: 'https://gravatar.com/avatar/' },
          tokenTtlSeconds: 1800,
        },
      },
    })

    const bundle = await hydrateBlogSettings(db)

    expect(bundle?.comments?.comments.avatar.sources).toEqual(['qq', 'github', 'gravatar'])
  })
})

describe('services/settings — rateLimit section', () => {
  it("writes a valid rateLimit patch to scope='blog.rateLimit' verbatim", async () => {
    await seedSections()

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

    const row = readRow('blog.rateLimit')
    expect(row.updatedBy).toBe(11)
    expect(row.data).toMatchObject({
      signInIp: { windowSeconds: 600, maxAttempts: 3 },
      likeIncreaseIp: { windowSeconds: 60 * 5, maxAttempts: 100 },
    })
    expect(next.bundle?.rateLimit?.signInIp).toEqual({ windowSeconds: 600, maxAttempts: 3 })
  })

  it('rejects a window shorter than 60s', async () => {
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
    expect(findSettingByScope(db, 'blog.rateLimit')).toBeNull()
  })

  it('rejects maxAttempts of 0 (the deny-everyone footgun)', async () => {
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
    expect(findSettingByScope(db, 'blog.rateLimit')).toBeNull()
  })

  it('merges a partial rateLimit patch into the stored row', async () => {
    await seedSections()

    await updateBlogSettingsSection(
      db,
      'rateLimit',
      {
        signInIp: { windowSeconds: 600, maxAttempts: 3 },
      },
      null,
    )

    const row = readRow('blog.rateLimit').data as Record<string, unknown>
    // Patched bucket overwritten; omitted buckets survive from the stored row.
    expect(row.signInIp).toEqual({ windowSeconds: 600, maxAttempts: 3 })
    expect(row.commentPostIp).toEqual(fixtureBundle.rateLimit!.commentPostIp)
    expect(row.likeIncreaseIp).toEqual(fixtureBundle.rateLimit!.likeIncreaseIp)
    expect(row.passkeyDeleteIp).toEqual(fixtureBundle.rateLimit!.passkeyDeleteIp)
  })
})

describe('services/settings — cache section', () => {
  it("writes a valid cache patch to scope='blog.cache' and refreshes the snapshot", async () => {
    await seedSections()

    const next = await updateBlogSettingsSection(
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

    const cache = readBucket('blog.cache', 'cache')
    expect((cache.og as Record<string, unknown>).prefix).toBe('opengraph:')
    expect((cache.calendar as Record<string, unknown>).prefix).toBe('cal:')
    expect((cache.avatar as Record<string, unknown>).prefix).toBe('gravatar:')
    expect(next.bundle?.cache?.cache.og.prefix).toBe('opengraph:')
  })

  it('rejects two buckets sharing the same prefix', async () => {
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
    expect(findSettingByScope(db, 'blog.cache')).toBeNull()
  })

  it('rejects a bucket whose prefix is a strict prefix of another', async () => {
    await expect(
      updateBlogSettingsSection(
        db,
        'cache',
        {
          cache: {
            og: { prefix: 'og:', ttlSeconds: 60 * 60 },
            calendar: { prefix: 'calendar:', ttlSeconds: 60 * 60 },
            // `og` is a strict prefix of `og:` and lacks the required `:` suffix.
            avatar: { prefix: 'og', ttlSeconds: 60 * 60 },
            imageMeta: { prefix: 'image-meta:', ttlSeconds: 60 * 60 },
            searchResult: { prefix: 'search-result:', ttlSeconds: 60 * 60 },
          },
        },
        null,
      ),
    ).rejects.toBeInstanceOf(DomainError)
    expect(findSettingByScope(db, 'blog.cache')).toBeNull()
  })

  it('rejects a prefix that collides with the reserved session: surface', async () => {
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
    expect(findSettingByScope(db, 'blog.cache')).toBeNull()
  })

  it('rejects a prefix that collides with the reserved rate-limit: surface', async () => {
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
    expect(findSettingByScope(db, 'blog.cache')).toBeNull()
  })

  it('rejects a prefix that does not end with `:`', async () => {
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
    expect(findSettingByScope(db, 'blog.cache')).toBeNull()
  })

  it('rejects TTL below 1 hour or above 30 days', async () => {
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
    expect(findSettingByScope(db, 'blog.cache')).toBeNull()
  })
})

describe('services/settings — security section', () => {
  it("writes the full security payload to scope='blog.security' verbatim", async () => {
    await seedSections()

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

    const data = readRow('blog.security').data as Record<string, unknown>
    expect(data.cors).toEqual({
      enabled: true,
      origins: ['https://example.com', 'https://app.example.com'],
    })
    expect(next.bundle?.security?.cors.enabled).toBe(true)
    expect(next.bundle?.security?.cors.origins).toEqual(['https://example.com', 'https://app.example.com'])
  })

  it('rejects an origin that is not a valid URL-like string (min length)', async () => {
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
    expect(findSettingByScope(db, 'blog.security')).toBeNull()
  })

  it('rejects more than 20 origins', async () => {
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
    expect(findSettingByScope(db, 'blog.security')).toBeNull()
  })
})

describe('services/settings — section patch merge', () => {
  it('keeps the stored SMTP TLS flags when a Zeabur-style patch only carries host', async () => {
    // A focused patch must never reset the stored row's untouched fields.
    await seedSections(fixtureBundle, { except: ['blog.mail'] })
    await db.insert(setting).values({
      scope: 'blog.mail',
      data: {
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
      },
    })

    await updateBlogSettingsSection(db, 'mail', { mail: { host: 'api.zeabur.com' } }, null)

    const mail = readBucket('blog.mail', 'mail')
    expect(mail.host).toBe('api.zeabur.com')
    expect(mail.smtpSecure).toBe(true)
    expect(mail.smtpRequireTls).toBe(false)
    expect(mail.smtpRejectUnauthorized).toBe(false)
    expect(mail.transport).toBe('smtp')
    expect(mail.apiKey).toMatch(/^enc2:/)
    expect(decryptIfNeeded(mail.apiKey as string)).toBe('STORED-ZEABUR-KEY')
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
    expect(findSettingByScope(db, 'blog.mail')).toBeNull()
  })

  it('rejects an unknown key at the section root with the issue list', async () => {
    const error = await updateBlogSettingsSection(db, 'mail', { bogus: {} }, null).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(DomainError)
    expect((error as InstanceType<typeof DomainError>).code).toBe('BAD_REQUEST')
    expect((error as InstanceType<typeof DomainError>).issues).toEqual([
      { message: 'Unrecognized key: "bogus"', path: ['bogus'] },
    ])
    expect(findSettingByScope(db, 'blog.mail')).toBeNull()
  })

  it('replaces csrf.exemptPaths wholesale instead of concatenating', async () => {
    await seedSections(fixtureBundle, { except: ['blog.security'] })
    await db.insert(setting).values({
      scope: 'blog.security',
      data: {
        csrf: { enabled: true, exemptPaths: ['/webhook/github', '/webhook/stripe'] },
        cors: { enabled: false, origins: [] },
        passkey: { enabled: false },
      },
    })

    await updateBlogSettingsSection(db, 'security', { csrf: { exemptPaths: ['/webhook/github'] } }, null)

    const csrf = readBucket('blog.security', 'csrf')
    expect(csrf.exemptPaths).toEqual(['/webhook/github'])
    expect(csrf.enabled).toBe(true)
  })

  it('replaces sidebar widgets wholesale (array of objects)', async () => {
    await seedSections()

    await updateBlogSettingsSection(db, 'sidebar', { sidebar: { widgets: [{ type: 'search', enabled: false }] } }, null)

    const sidebar = readBucket('blog.sidebar', 'sidebar')
    expect(sidebar.widgets).toEqual([{ type: 'search', enabled: false }])
  })

  it('merges a nested cors patch and preserves the sibling buckets', async () => {
    await seedSections(fixtureBundle, { except: ['blog.security'] })
    await db.insert(setting).values({
      scope: 'blog.security',
      data: {
        csrf: { enabled: true, exemptPaths: ['/webhook/github'] },
        cors: { enabled: false, origins: ['https://a.example.com', 'https://b.example.com'] },
        passkey: { enabled: false },
      },
    })

    await updateBlogSettingsSection(db, 'security', { cors: { enabled: true } }, null)

    const row = readRow('blog.security').data as Record<string, unknown>
    expect(row.cors).toEqual({ enabled: true, origins: ['https://a.example.com', 'https://b.example.com'] })
    expect(row.csrf).toEqual({ enabled: true, exemptPaths: ['/webhook/github'] })
    expect(row.passkey).toEqual({ enabled: false })
  })

  it('accepts a complete fonts payload and writes it verbatim', async () => {
    await seedSections(fixtureBundle, { except: ['blog.fonts'] })
    // setFontSlot posts a full FontsSettings — a complete object is a valid patch.
    const fontsPayload = {
      og: { family: 'NotoSansCJK' },
      calendar: { family: '' },
      global: ['3f6b9a1e-2f3c-4b1e-9f2a-7b1c0d2e4f5a'],
      post: [],
      code: ['1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d'],
    }

    await updateBlogSettingsSection(db, 'fonts', fontsPayload, null)

    expect(readRow('blog.fonts').data).toEqual(fontsPayload)
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

  it('hydrate rejects legacy 3-bucket cache rows so the registry default backfills the section', async () => {
    // Legacy pre-imageMeta rows must backfill, not crash the cache card.
    await seedSections(fixtureBundle, { except: ['blog.cache'] })
    await db.insert(setting).values({
      scope: 'blog.cache',
      data: {
        cache: {
          og: { prefix: 'og:', ttlSeconds: 3600 },
          calendar: { prefix: 'calendar:', ttlSeconds: 3600 },
          avatar: { prefix: 'avatar:', ttlSeconds: 3600 },
        },
      },
    })

    const bundle = await hydrateBlogSettings(db)

    expect(bundle).not.toBeNull()
    expect(bundle!.cache!.cache.imageMeta).toEqual({ prefix: 'image-meta:', ttlSeconds: 60 * 60 })
    // The backfill rewrote the legacy row in the database itself.
    const cache = readBucket('blog.cache', 'cache')
    expect(cache.imageMeta).toEqual({ prefix: 'image-meta:', ttlSeconds: 60 * 60 })
  })
})
