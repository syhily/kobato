const navigationDefaults = { navigation: { sideNav: [], footerNav: [] } } as const
const socialsDefaults = { socials: [] } as const
const contentDefaults = {
  pagination: { posts: 10, category: 10, tags: 10, search: 10 },
  feed: { full: false, size: 20 },
  post: { sort: 'desc' as const, sortBy: 'publishedAt' as const, featureEnabled: false },
  footnotes: { sectionTitle: '尾声礼记' },
} as const
const sidebarDefaults = {
  sidebar: {
    widgets: [
      { type: 'search' as const, enabled: false },
      { type: 'recentPosts' as const, enabled: false, count: 5 },
      { type: 'recentComments' as const, enabled: false, count: 5 },
      { type: 'randomTags' as const, enabled: false, count: 20 },
      { type: 'todayCalendar' as const, enabled: false },
    ],
  },
} as const
const commentsDefaults = {
  comments: {
    size: 10,
    avatar: { mirror: 'https://www.gravatar.com/avatar', size: 80 },
    tokenTtlSeconds: 1800,
  },
} as const
const seoDefaults = {
  toc: { minHeadingLevel: 2, maxHeadingLevel: 4 },
  og: { width: 1200, height: 630 },
} as const
const mailDefaults = {
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
    mailgunDomain: '',
    mailgunApiKey: '',
  },
} as const
const cacheDefaults = {
  cache: {
    og: { prefix: 'og:', ttlSeconds: 60 * 60 * 24 },
    calendar: { prefix: 'calendar:', ttlSeconds: 60 * 60 * 24 },
    avatar: { prefix: 'avatar:', ttlSeconds: 60 * 60 * 24 },
    imageMeta: { prefix: 'image-meta:', ttlSeconds: 60 * 60 },

    embeddingSearch: { prefix: 'embedding-search:', ttlSeconds: 60 * 60 * 24 * 7 },
    searchResult: { prefix: 'search-result:', ttlSeconds: 60 * 60 },
  },
} as const

export {
  navigationDefaults,
  socialsDefaults,
  contentDefaults,
  sidebarDefaults,
  commentsDefaults,
  seoDefaults,
  mailDefaults,
  cacheDefaults,
}

export const ASSETS_STORAGE_INSTALL_DEFAULTS = {
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
} as const
