import type { BlogSettingsBundle } from '@kobato/settings/types.ts'

import { rateLimitDefaults } from '@kobato/settings/rate-limit-defaults.ts'
import { analyticsDefaults } from '@kobato/settings/sections/analytics.ts'
import { backupDefaults } from '@kobato/settings/sections/backup.ts'
import { cacheDefaults } from '@kobato/settings/sections/cache.ts'
import { limitsDefaults } from '@kobato/settings/sections/limits.ts'
import { mailDefaults } from '@kobato/settings/sections/mail.ts'
import { newsletterDefaults } from '@kobato/settings/sections/newsletter.ts'
import { observabilityDefaults } from '@kobato/settings/sections/observability.ts'
import { securityDefaults } from '@kobato/settings/sections/security.ts'
import { seoDefaults } from '@kobato/settings/sections/seo.ts'
import { BLOG_SETTINGS_SNAPSHOT_SLOT } from '@kobato/settings/snapshot.ts'
import { deepFreeze } from '@kobato/test/deep-freeze.ts'

export const TEST_BLOG_SETTINGS_BUNDLE: BlogSettingsBundle = {
  siteIdentity: {
    title: '且听书吟',
    titleSeparator: '-',
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
      avatar: { mirror: 'https://gravatar.loli.net/avatar', sources: ['qq', 'github', 'gravatar'] },
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
      og: { ...cacheDefaults.cache.og, ttlSeconds: 60 * 60 * 24 * 7 },
      calendar: { ...cacheDefaults.cache.calendar, ttlSeconds: 60 * 60 * 24 },
      avatar: { ...cacheDefaults.cache.avatar, ttlSeconds: 60 * 60 * 24 * 7 },

      searchResult: { ...cacheDefaults.cache.searchResult },
    },
  },
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
  security: {
    ...securityDefaults,
    csrf: { ...securityDefaults.csrf, exemptPaths: [...securityDefaults.csrf.exemptPaths] },
    cors: { ...securityDefaults.cors, origins: [...securityDefaults.cors.origins] },
  },
  observability: observabilityDefaults,
}

export function setBlogSettingsBundleForTests(value: BlogSettingsBundle | null | undefined): void {
  const frozen =
    value == null ? value : value === TEST_BLOG_SETTINGS_BUNDLE ? deepFreeze(value) : deepFreeze(structuredClone(value))
  BLOG_SETTINGS_SNAPSHOT_SLOT.write(frozen)
  BLOG_SETTINGS_SNAPSHOT_SLOT.writeHydration(frozen === undefined ? undefined : Promise.resolve(frozen ?? null))
}

export function resetBlogSettingsForTests(): void {
  BLOG_SETTINGS_SNAPSHOT_SLOT.write(null)
  BLOG_SETTINGS_SNAPSHOT_SLOT.writeHydration(undefined)
}
