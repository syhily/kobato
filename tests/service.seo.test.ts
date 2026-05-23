import type { MetaDescriptor } from 'react-router'

import { beforeEach, describe, expect, it } from 'vitest'

import type { BlogSettingsBundle } from '@/shared/config/blog'

import { setBlogSettingsBundleForTests } from '@/server/domains/settings/snapshot'
import { pageTitle, routeMeta } from '@/server/render/seo/meta'

// `routeMeta` and `pageTitle` consult the snapshot reader for the
// site title / website / OG defaults. There is no longer a baked-in
// `DEFAULT_SETTINGS`, so the test suite seeds an explicit fixture
// snapshot before the assertions run and tears it down afterwards so
// other test files don't observe leaked global state.
const fixture: BlogSettingsBundle = {
  siteIdentity: {
    title: 'Test Blog',
    description: 'Test description',
    website: 'https://test.example',
    keywords: ['react', 'router'],
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
      avatar: { mirror: 'https://cdn.test.example/avatar', size: 80 },
      tokenTtlSeconds: 1800,
    },
  },
  seo: {
    toc: { minHeadingLevel: 2, maxHeadingLevel: 4 },
    og: { width: 1200, height: 630 },
  },

  mail: { mail: { enabled: false, host: '', apiKey: '', sender: '' } },
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

beforeEach(() => {
  setBlogSettingsBundleForTests(fixture)
})

// Helpers to find a meta tag by predicate. routeMeta produces a heterogeneous
// list of `name`, `property`, and `tagName: link` entries — we treat it as a
// flat map and assert the relevant keys are present and correct.
type MetaEntry = MetaDescriptor & Record<string, unknown>

function findByName(meta: MetaEntry[], name: string) {
  return meta.find((m) => m.name === name) as MetaEntry | undefined
}
function findByProperty(meta: MetaEntry[], property: string) {
  return meta.find((m) => m.property === property) as MetaEntry | undefined
}
function findLink(meta: MetaEntry[], rel: string) {
  return meta.find((m) => m.tagName === 'link' && m.rel === rel) as MetaEntry | undefined
}

describe('services/seo/meta — pageTitle', () => {
  it('returns the site default title when no override is supplied', () => {
    expect(pageTitle()).toBe(`${fixture.siteIdentity!.title} - ${fixture.siteIdentity!.description}`)
  })

  it('appends the site name to per-page titles', () => {
    expect(pageTitle('文章标题')).toBe(`文章标题 - ${fixture.siteIdentity!.title}`)
  })
})

describe('services/seo/meta — routeMeta', () => {
  it('emits the standard base/robots/og/twitter tags by default', () => {
    const meta = routeMeta() as MetaEntry[]
    expect(findByName(meta, 'robots')?.content).toBe('index, follow')
    expect(findByProperty(meta, 'og:type')?.content).toBe('website')
    expect(findByProperty(meta, 'og:title')).toBeDefined()
    expect(findByProperty(meta, 'twitter:card')?.content).toBe('summary_large_image')
    expect(findLink(meta, 'alternate')).toBeDefined()
    expect(findLink(meta, 'icon')).toBeDefined()
  })

  it('flips robots tags to noindex when noindex=true', () => {
    const meta = routeMeta({ noindex: true }) as MetaEntry[]
    expect(findByName(meta, 'robots')?.content).toBe('noindex,follow')
    expect(findByName(meta, 'googlebot')?.content).toBe('noindex,follow')
  })

  it('emits article-specific tags for `kind: post` variants', () => {
    const meta = routeMeta({
      title: 'Hello',
      variant: {
        kind: 'post',
        article: {
          date: new Date('2024-01-02T03:04:05.000Z'),
          updated: new Date('2024-02-03T00:00:00.000Z'),
          category: '默认分类',
          tags: ['typescript', 'react'],
        },
      },
    }) as MetaEntry[]

    expect(findByProperty(meta, 'og:type')?.content).toBe('article')
    expect(findByProperty(meta, 'article:published_time')?.content).toBe('2024-01-02T03:04:05.000Z')
    expect(findByProperty(meta, 'article:modified_time')?.content).toBe('2024-02-03T00:00:00.000Z')
    expect(findByProperty(meta, 'article:section')?.content).toBe('默认分类')
    const tagEntries = meta.filter((m) => m.property === 'article:tag')
    expect(tagEntries.map((entry) => entry.content)).toEqual(['typescript', 'react'])
  })

  it('emits canonical/prev/next links only when requested', () => {
    const meta = routeMeta({
      pageUrl: '/posts/hello',
      canonical: true,
      prevUrl: '/posts/page/1',
      nextUrl: '/posts/page/3',
    }) as MetaEntry[]

    expect(findLink(meta, 'canonical')?.href).toBe(`${fixture.siteIdentity!.website}/posts/hello`)
    expect(findLink(meta, 'prev')?.href).toBe(`${fixture.siteIdentity!.website}/posts/page/1`)
    expect(findLink(meta, 'next')?.href).toBe(`${fixture.siteIdentity!.website}/posts/page/3`)
  })

  it('falls back to the default OG image when ogImageUrl is missing', () => {
    const meta = routeMeta() as MetaEntry[]
    const og = findByProperty(meta, 'og:image')
    expect(og?.content).toContain('/images/open-graph.png')
    expect(String(og?.content).startsWith('http')).toBe(true)
  })
})
