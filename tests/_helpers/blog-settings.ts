// Shared blog settings fixtures for the test suite. After the
// per-section settings refactor the codebase has no `DEFAULT_SETTINGS`:
// any route, sidebar, formatter, OG, or thumbhash test that touches
// the runtime config has to seed the in-process snapshot before the
// import chain reaches `requireBlogSettingsSection()`. The setup file
// (tests/setup.ts) installs the bundle once per worker so individual
// tests don't have to.
//
// `TEST_BLOG_SETTINGS_BUNDLE` is the bucketed shape that mirrors the
// on-disk `setting('blog.<section>')` rows. It is the canonical fixture
// — there is no longer a parallel "legacy aggregated `BlogSettings`"
// fixture, because the legacy projection has been deleted from the
// shared module entirely.
//
// Values mirror the historical `DEFAULT_SETTINGS` so snapshot-based
// tests (post detail / home / SEO head / …) keep working without
// their `__snapshots__` files churning every time an unrelated default
// changes. Tests that need a different shape can call
// `setBlogSettingsBundleForTests(custom)` in their own `beforeEach`.
import type { BlogSettingsBundle } from '@/shared/config/types'

import { CACHE_BUCKET_FALLBACKS } from '@/shared/types/cache'

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
    },
  },
  comments: {
    comments: {
      size: 10,
      avatar: { mirror: 'https://gravatar.loli.net/avatar', size: 120 },
      tokenTtlSeconds: 1800,
    },
  },
  seo: {
    toc: { minHeadingLevel: 2, maxHeadingLevel: 3 },
    og: { width: 1200, height: 768 },
  },

  mail: {
    mail: { enabled: false, host: 'api.zeabur.com', apiKey: '', sender: 'noreply@example.com' },
  },
  cache: {
    cache: {
      og: { ...CACHE_BUCKET_FALLBACKS.og, ttlSeconds: 60 * 60 * 24 * 7 },
      calendar: { ...CACHE_BUCKET_FALLBACKS.calendar, ttlSeconds: 60 * 60 * 24 },
      avatar: { ...CACHE_BUCKET_FALLBACKS.avatar, ttlSeconds: 60 * 60 * 24 * 7 },
      imageMeta: { ...CACHE_BUCKET_FALLBACKS.imageMeta },

      embeddingSearch: { ...CACHE_BUCKET_FALLBACKS.embeddingSearch },
      searchResult: { ...CACHE_BUCKET_FALLBACKS.searchResult },
    },
  },
  // Rate-limit fixture mirrors the historical hard-coded thresholds
  // so the suite's existing 429 assertions (auth flow, comment reply)
  // keep passing without per-test bundle surgery. Tests that need to
  // exercise the "exceeded" branch in a single hit can override the
  // bucket through `setBlogSettingsBundleForTests({ ..., rateLimit:
  // { ...rateLimit, signInIp: { windowSeconds: 60, maxAttempts: 1 } } })`.
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
    og: { family: '' },
    calendar: { family: '' },
    globalCss: [],
    postCss: [],
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
    otp: { enabled: false },
    passkey: { enabled: false },
  },
}
