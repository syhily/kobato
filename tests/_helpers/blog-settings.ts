// Shared blog settings fixtures. Seed the in-process snapshot before the
// import chain reaches `requireBlogSettingsSection()`. Registry-identical
// sections are imported from the seeds, the rest frozen for snapshot stability.
import type { BlogSettingsBundle } from '@/shared/config/types'

import { deepFreeze } from '#/_helpers/deep-freeze'
import { analyticsDefaults } from '@/server/domains/settings/sections/analytics'
import { backupDefaults } from '@/server/domains/settings/sections/backup'
import { limitsDefaults } from '@/server/domains/settings/sections/limits'
import { mailDefaults } from '@/server/domains/settings/sections/mail'
import { newsletterDefaults } from '@/server/domains/settings/sections/newsletter'
import { securityDefaults } from '@/server/domains/settings/sections/security'
import { seoDefaults } from '@/server/domains/settings/sections/seo'
import { rateLimitDefaults } from '@/shared/config/defaults'
import { BLOG_SETTINGS_SNAPSHOT_SLOT } from '@/shared/config/snapshot'
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
  // Uploads enabled by default so render suites exercise the enabled path.
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
  // Historical 429 thresholds — suites assert against them; override per test when needed.
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
  // Spread readonly seed arrays — `as const` slots won't assign to mutable DTO arrays.
  security: {
    ...securityDefaults,
    csrf: { ...securityDefaults.csrf, exemptPaths: [...securityDefaults.csrf.exemptPaths] },
    cors: { ...securityDefaults.cors, origins: [...securityDefaults.cors.origins] },
  },
}

/** Seed (or clear) the snapshot. Custom bundles are cloned + frozen; the
 *  shared fixture keeps identity (`toBe`). `undefined` = no hydration,
 *  `null` = "no settings". */
export function setBlogSettingsBundleForTests(value: BlogSettingsBundle | null | undefined): void {
  const frozen =
    value == null ? value : value === TEST_BLOG_SETTINGS_BUNDLE ? deepFreeze(value) : deepFreeze(structuredClone(value))
  BLOG_SETTINGS_SNAPSHOT_SLOT.write(frozen)
  BLOG_SETTINGS_SNAPSHOT_SLOT.writeHydration(frozen === undefined ? undefined : Promise.resolve(frozen ?? null))
}

/** Clear the snapshot so the next hydrate re-reads from the DB. */
export function resetBlogSettingsForTests(): void {
  BLOG_SETTINGS_SNAPSHOT_SLOT.write(null)
  BLOG_SETTINGS_SNAPSHOT_SLOT.writeHydration(undefined)
}
