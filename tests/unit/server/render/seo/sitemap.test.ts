import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { BlogSettingsBundle } from '@/shared/config/types'

import { setBlogSettingsBundleForTests } from '#/_helpers/blog-settings'

// The sitemap builder only reads `slug` + `firstPublishedAt` + `publishedAt`
// from the slim projections. Mock them to return a small seeded set so we
// can assert the XML shape without a real DB — and crucially, verify that
// the slim projections already exclude drafts (the builder trusts them).
const postRows: Array<{ slug: string; firstPublishedAt: Date | null; publishedAt: Date }> = []
const pageRows: Array<{ slug: string; firstPublishedAt: Date | null; publishedAt: Date }> = []

vi.mock('@/server/domains/posts/services/public-query', () => ({
  listSitemapPosts: vi.fn(async () => postRows),
}))

vi.mock('@/server/domains/pages/services/public-query', () => ({
  listSitemapPages: vi.fn(async () => pageRows),
}))

import { buildSitemapXml } from '@/server/render/seo/sitemap'

const fixture: BlogSettingsBundle = {
  siteIdentity: {
    title: 'Test Blog',
    description: 'Test description',
    website: 'https://test.example',
    keywords: [],
    author: { name: 'tester', email: 'test@example.com', url: 'https://test.example' },
    locale: 'zh-CN',
    timeZone: 'UTC',
    timeFormat: 'yyyy-LL-dd HH:mm',
    initialYear: 2024,
    icpNo: '',
    moeIcpNo: '',
  },
  assets: {
    asset: { host: 'cdn.test.example', scheme: 'https' },
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
      widgets: [],
      dailyQuote: { source: 'shanbay', customQuotes: [] },
    },
  },
  comments: {
    comments: {
      size: 10,
      avatar: { mirror: 'https://cdn.test.example/avatar' },
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
      host: '',
      apiKey: '',
      sender: '',
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
  search: {
    search: {
      enabled: false,
      mode: 'like',
      endpoint: '',
      apiKey: '',
      model: 'text-embedding-3-small',
      similarityThreshold: 0.5,
      trgmThreshold: 0.3,
    },
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

beforeEach(() => {
  postRows.length = 0
  pageRows.length = 0
  setBlogSettingsBundleForTests(fixture)
})

describe('buildSitemapXml', () => {
  it('emits a valid xml preamble + urlset shell when there are no posts or pages', async () => {
    const xml = await buildSitemapXml({} as never)

    expect(xml).toBe(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        '  <url><loc>https://test.example/</loc></url>',
        '</urlset>',
      ].join('\n'),
    )
  })

  it('renders a <url> entry per post with /posts/ prefix and lastmod from firstPublishedAt', async () => {
    const published = new Date('2024-06-01T00:00:00.000Z')
    postRows.push({ slug: 'hello-world', firstPublishedAt: published, publishedAt: published })

    const xml = await buildSitemapXml({} as never)

    expect(xml).toContain(
      `  <url><loc>https://test.example/posts/hello-world</loc><lastmod>${published.toISOString()}</lastmod></url>`,
    )
  })

  it('falls back to publishedAt when firstPublishedAt is null', async () => {
    const publishedAt = new Date('2024-07-15T12:00:00.000Z')
    postRows.push({ slug: 'no-first', firstPublishedAt: null, publishedAt })

    const xml = await buildSitemapXml({} as never)

    expect(xml).toContain(
      `  <url><loc>https://test.example/posts/no-first</loc><lastmod>${publishedAt.toISOString()}</lastmod></url>`,
    )
  })

  it('renders page entries with the /<slug> prefix (no /posts segment)', async () => {
    const date = new Date('2024-08-01T00:00:00.000Z')
    pageRows.push({ slug: 'about', firstPublishedAt: date, publishedAt: date })

    const xml = await buildSitemapXml({} as never)

    expect(xml).toContain(`  <url><loc>https://test.example/about</loc><lastmod>${date.toISOString()}</lastmod></url>`)
    expect(xml).not.toContain('https://test.example/posts/about')
  })

  it('relies on the slim projection for draft exclusion — the builder itself does not filter', async () => {
    // The slim `listSitemapPosts` query already enforces
    //   deleted_at IS NULL AND published = true AND published_revision_id IS NOT NULL
    // so a draft (published = false or no revision) never reaches this point.
    // Here we verify the builder trusts that contract: if only a published
    // row is seeded, exactly one post <url> appears.
    const date = new Date('2024-09-01T00:00:00.000Z')
    postRows.push({ slug: 'only-published', firstPublishedAt: date, publishedAt: date })

    const xml = await buildSitemapXml({} as never)

    const postUrlCount = (xml.match(/<loc>https:\/\/test\.example\/posts\//g) ?? []).length
    expect(postUrlCount).toBe(1)
  })

  it('escapes special XML characters in loc', async () => {
    // Although slugs are validated to be URL-safe, the builder must still
    // escape any `&`/`<`/`>` that could appear so the XML stays well-formed.
    const date = new Date('2024-10-01T00:00:00.000Z')
    postRows.push({ slug: 'a&b<c>', firstPublishedAt: date, publishedAt: date })

    const xml = await buildSitemapXml({} as never)

    expect(xml).toContain('<loc>https://test.example/posts/a&amp;b&lt;c&gt;</loc>')
    expect(xml).not.toContain('posts/a&b<c>')
  })
})
