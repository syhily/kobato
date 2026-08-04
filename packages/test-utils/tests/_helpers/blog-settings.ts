// Shared blog settings fixtures for the test suite: any route, sidebar,
// formatter, OG, or thumbhash test that touches the runtime config has to
// seed the in-process snapshot before the import chain reaches
// `requireBlogSettingsSection()`. The per-project setup files
// (tests/unit/setup.ts, tests/it/setup.ts) install the bundle once per
// worker so individual tests don't have to.
//
// `TEST_BLOG_SETTINGS_BUNDLE` is the bucketed shape that mirrors the
// on-disk `setting('blog.<section>')` rows. Sections whose fixture values
// are byte-identical to the registry seed IMPORT those defaults (seo,
// mail, newsletter, rateLimit, backup, limits, analytics, security) so
// they can never drift; the rest are deliberate historical freezes that
// keep snapshot-based tests (post detail / home / SEO head / …) from
// churning every time an unrelated default changes. The contract test
// `tests/unit/shared/contracts/blog-settings-fixture.test.ts` parses
// every section against its registry schema so a frozen value that stops
// satisfying its schema fails loudly. Tests that need a different shape
// can call `setBlogSettingsBundleForTests(custom)` in their own
// `beforeEach`.
import type { BlogSettingsBundle } from '@kobato/shared/config/types'

import { deepFreeze } from '#/_helpers/deep-freeze'

import { analyticsDefaults } from '@kobato/server/domains/settings/sections/analytics'
import { backupDefaults } from '@kobato/server/domains/settings/sections/backup'
import { limitsDefaults } from '@kobato/server/domains/settings/sections/limits'
import { mailDefaults } from '@kobato/server/domains/settings/sections/mail'
import { newsletterDefaults } from '@kobato/server/domains/settings/sections/newsletter'
import { securityDefaults } from '@kobato/server/domains/settings/sections/security'
import { seoDefaults } from '@kobato/server/domains/settings/sections/seo'
import { rateLimitDefaults } from '@kobato/shared/config/defaults'
import { BLOG_SETTINGS_SNAPSHOT_SLOT } from '@kobato/shared/config/snapshot'
import { CACHE_BUCKET_FALLBACKS } from '@kobato/shared/types/cache'

export const TEST_BLOG_SETTINGS_BUNDLE: BlogSettingsBundle = {
  siteIdentity: {
    title: '且听书吟',
    description: '诗与梦想的远方',
    website: 'https://example.com',
    keywords: ['雨帆', '且听书吟', 'syhily', 'kobato', 'こばと'],
    author: { name: '雨帆', email: 'syhily@gmail.com', url: 'https://example.com' },
    locale: 'zh-CN',
    timeZone: 'Asia/Shanghai',
    timeFormat: 'yyyy-MM-dd',
    initialYear: 2011,
    icpNo: '皖ICP备2021002315号-2',
  },
  // Test fixture has the upload toggle ON with a fully-configured
  // bucket so the storage-dispatch / render-enhance suites can
  // exercise the "uploads enabled" path by default and switch the
  // toggle off in individual tests as needed.
  assets: {
    asset: { host: 'assets.example.com', scheme: 'https' },
    storage: {
      enabled: true,
      endpoint: 'https://s3.example.com',
      region: 'auto',
      bucket: 'kobato-test',
      accessKeyId: 'AKIA-TEST',
      secretAccessKey: 'secret-test',
      forcePathStyle: false,
      urlTemplate: '',
    },
    upload: { maxBytes: 8 * 1024 * 1024, jpegQuality: 82 },
  },
  navigation: {
    navigation: {
      sideNav: [
        { text: '首页', link: '/' },
        { text: '分类', link: '/categories' },
        { text: '归档', link: '/archives' },
        { text: '关于', link: '/about' },
        { text: '留言', link: '/guestbook' },
        { text: '友链', link: '/links' },
      ],
      footerNav: [],
    },
  },
  socials: {
    socials: [
      { name: 'GitHub', network: 'github', type: 'link', link: 'https://github.com/syhily' },
      { name: 'X', network: 'x', type: 'link', link: 'https://x.com/amehochan' },
      {
        name: 'Yufan Sheng',
        network: 'wechat',
        type: 'qrcode',
        title: '扫码加我微信好友',
        link: 'https://u.wechat.com/EBpmuKmrVz4YVFnoCJdnruA',
      },
    ],
  },
  content: {
    pagination: { posts: 6, category: 7, tags: 7, search: 7 },
    feed: { full: true, size: 20 },
    post: { sort: 'desc', sortBy: 'publishedAt', featureEnabled: false },
    footnotes: { sectionTitle: '尾声礼记' },
  },
  sidebar: {
    sidebar: {
      widgets: [
        { type: 'search', enabled: true },
        { type: 'recentPosts', enabled: true, count: 5 },
        { type: 'recentComments', enabled: true, count: 5 },
        { type: 'randomTags', enabled: true, count: 10 },
        { type: 'todayCalendar', enabled: true },
      ],
      dailyQuote: { source: 'shanbay', customQuotes: [] },
    },
  },
  comments: {
    comments: {
      size: 10,
      avatar: { mirror: 'https://gravatar.loli.net/avatar' },
      tokenTtlSeconds: 1800,
    },
  },
  webmentions: {
    webmention: { receiveEnabled: true, displayOnPosts: true },
  },
  // Byte-identical to the registry seeds — imported, not copied.
  seo: seoDefaults,
  mail: mailDefaults,
  newsletter: newsletterDefaults,
  cache: {
    cache: {
      og: { ...CACHE_BUCKET_FALLBACKS.og, ttlSeconds: 60 * 60 * 24 * 7 },
      calendar: { ...CACHE_BUCKET_FALLBACKS.calendar, ttlSeconds: 60 * 60 * 24 },
      avatar: { ...CACHE_BUCKET_FALLBACKS.avatar, ttlSeconds: 60 * 60 * 24 * 7 },
      imageMeta: { ...CACHE_BUCKET_FALLBACKS.imageMeta },

      searchResult: { ...CACHE_BUCKET_FALLBACKS.searchResult },
    },
  },
  // Rate-limit fixture mirrors the historical hard-coded thresholds
  // (byte-identical to `rateLimitDefaults`, hence imported) so the
  // suite's existing 429 assertions (auth flow, comment reply)
  // keep passing without per-test bundle surgery. Tests that need to
  // exercise the "exceeded" branch in a single hit can override the
  // bucket through `setBlogSettingsBundleForTests({ ..., rateLimit:
  // { ...rateLimit, signInIp: { windowSeconds: 60, maxAttempts: 1 } } })`.
  rateLimit: rateLimitDefaults,
  fonts: {
    og: { family: '' },
    calendar: { family: '' },
    global: [],
    post: [],
    code: [],
  },
  backup: backupDefaults,
  limits: limitsDefaults,
  analytics: analyticsDefaults,
  // The `as const` seed's empty `readonly []` slots won't assign to the
  // DTO's mutable arrays — spread them into fresh mutable arrays (the
  // values still track `securityDefaults` by construction).
  security: {
    ...securityDefaults,
    csrf: { ...securityDefaults.csrf, exemptPaths: [...securityDefaults.csrf.exemptPaths] },
    cors: { ...securityDefaults.cors, origins: [...securityDefaults.cors.origins] },
  },
}

/**
 * Seed (or clear) the in-process blog-settings snapshot for tests.
 * Custom bundles are deep-cloned + deep-frozen so per-test overrides
 * can't leak mutations into a sibling test. The shared fixture itself
 * keeps its identity (suites assert `toBe(TEST_BLOG_SETTINGS_BUNDLE)`)
 * and is frozen in place instead — `deepFreeze` is idempotent, so the
 * per-test re-seed is a no-op after the first call. `undefined` drops
 * the in-flight hydration only (next read re-hydrates); `null` installs
 * a "no settings" snapshot.
 */
export function setBlogSettingsBundleForTests(value: BlogSettingsBundle | null | undefined): void {
  const frozen =
    value == null ? value : value === TEST_BLOG_SETTINGS_BUNDLE ? deepFreeze(value) : deepFreeze(structuredClone(value))
  BLOG_SETTINGS_SNAPSHOT_SLOT.write(frozen)
  BLOG_SETTINGS_SNAPSHOT_SLOT.writeHydration(frozen === undefined ? undefined : Promise.resolve(frozen ?? null))
}

/**
 * Empty the in-process blog-settings snapshot (value `null`, no
 * in-flight hydration), restoring the pre-install state so the next
 * `hydrateBlogSettings()` re-reads from the DB.
 */
export function resetBlogSettingsForTests(): void {
  BLOG_SETTINGS_SNAPSHOT_SLOT.write(null)
  BLOG_SETTINGS_SNAPSHOT_SLOT.writeHydration(undefined)
}
