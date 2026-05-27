import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { createDbPool, closePool } from '@/server/infra/db/pool'

import { clearAllTables } from './_helpers/integration-db'

// Tests that the inline cache clearing in posts/pages services works
// correctly, replacing the old `subscribeCatalogInvalidate` pattern.
//
// We keep the repo mocks so the test focuses purely on cache-invalidation
// semantics; only `db.pool` is real so `createPost` (which issues a raw
// `db.transaction`) can execute without a brittle hand-rolled transaction
// stub.

const poolManager = createDbPool()
const db: NodePgDatabase = poolManager.db
const pool: Pool = poolManager.pool

afterAll(async () => {
  await closePool(pool)
})

vi.mock('@/server/domains/posts/repos/admin-query', () => ({
  countPostMetas: vi.fn(async () => 0),
  listPostMetas: vi.fn(async () => []),
}))
vi.mock('@/server/domains/content/repo', () => ({
  findContentById: vi.fn(),
  findContentsByIds: vi.fn(async () => []),
  findLatestDraft: vi.fn(),
  findLatestRevision: vi.fn(),
  listRevisions: vi.fn(async () => []),
  publishLatestRevision: vi.fn(async () => ({ revisionId: 1n, changed: true })),
  saveDraftRevision: vi.fn(async () => ({ id: 1n })),
}))
vi.mock('@/server/domains/posts/repos/single', () => ({
  findPostMetaById: vi.fn(),
  findPostMetaBySlug: vi.fn(),
  findPublicPostMetaBySlug: vi.fn(),
}))
vi.mock('@/server/domains/posts/repos/public-query', () => ({
  listPublicPostMetas: vi.fn(async () => []),
}))
vi.mock('@/server/domains/posts/repos/write', () => ({
  restorePostMeta: vi.fn(async () => true),
  softDeletePostMeta: vi.fn(async () => true),
  updatePostMetaById: vi.fn(async () => null),
}))

function makeMockPageRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1n,
    slug: 'new-page',
    title: 'New Page',
    summary: '',
    cover: '',
    og: null,
    published: false,
    commentsEnabled: true,
    showToc: false,
    showUpdated: false,
    showFriends: false,
    publishedAt: new Date(),
    publishedRevisionId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    authorId: null,
    permalink: '/new-page',
    ...overrides,
  }
}

vi.mock('@/server/domains/pages/repo', () => ({
  countPageMetas: vi.fn(async () => 0),
  findContentById: vi.fn(),
  findContentsByIds: vi.fn(async () => []),
  findLatestDraft: vi.fn(),
  findLatestRevision: vi.fn(),
  findPageMetaById: vi.fn(),
  findPageMetaBySlug: vi.fn(async () => null),
  findPublicPageMetaBySlug: vi.fn(),
  insertPageMeta: vi.fn(async () => makeMockPageRow()),
  listPageMetas: vi.fn(async () => []),
  listPublicPageMetas: vi.fn(async () => []),
  listRevisions: vi.fn(async () => []),
  publishLatestRevision: vi.fn(async () => ({ revisionId: 1n, changed: true })),
  restorePageMeta: vi.fn(async () => true),
  saveDraftRevision: vi.fn(async () => ({ id: 1n })),
  softDeletePageMeta: vi.fn(async () => true),
  updatePageMetaById: vi.fn(async () => null),
}))

vi.mock('@/server/domains/posts/indexer', () => ({
  indexPost: vi.fn(),
  removePostIndex: vi.fn(),
}))

vi.mock('@/server/domains/pages/image-sync', () => ({
  syncLibraryImageBlocks: vi.fn(),
}))

vi.mock('@/server/infra/db/operations/tag', () => ({
  seedTagIfMissing: vi.fn(),
}))

vi.mock('@/server/infra/db/operations/metric', () => ({
  ensureMetricsBatch: vi.fn(),
  ensureMetric: vi.fn(),
}))

vi.mock('@/shared/config/getters', () => ({
  requireBlogSettingsSection: (section: string) => {
    if (section === 'content') {
      return { post: { sortBy: 'publishedAt' }, page: {} }
    }
    if (section === 'pagination') {
      return { posts: 6 }
    }
    if (section === 'siteIdentity') {
      return { website: 'https://example.test', description: 'desc' }
    }
    if (section === 'cache') {
      return { cache: { og: { prefix: 'og:', ttlSeconds: 3600 } } }
    }
    return {}
  },
  getCacheSettings: () => ({ cache: { og: { prefix: 'og:', ttlSeconds: 3600 } } }),
  getBlogSettingsBundleSync: () => ({
    pagination: { posts: 6 },
    content: { post: { sortBy: 'publishedAt' }, page: {} },
    assets: { storage: { enabled: false } },
    rateLimit: { resourceIp: { windowSeconds: 60, maxAttempts: 60 } },
    siteIdentity: { website: 'https://example.test', description: 'desc' },
  }),
}))

vi.mock('@/server/domains/settings/sections', () => ({
  SECTION_REGISTRY: {},
}))

vi.mock('@/server/infra/db/operations/like', () => ({
  commentCountsByOwnerIds: vi.fn(async () => []),
  metricsByOwnerIds: vi.fn(async () => []),
}))

beforeEach(async () => {
  vi.resetModules()
  vi.clearAllMocks()
  await clearAllTables(db)
  const { redisInstance } = await import('@/server/infra/redis/storage')
  await redisInstance().flushdb()
})

describe('posts service cache clearing', () => {
  it('loadCatalogPostMetas returns cached data within TTL', async () => {
    const publicQuery = await import('@/server/domains/posts/repos/public-query')
    vi.mocked(publicQuery.listPublicPostMetas).mockImplementation(
      async () =>
        [
          {
            id: 1n,
            slug: 'hello',
            title: 'Hello',
            summary: '',
            cover: '',
            published: true,
            visible: true,
            publishedAt: new Date(),
            deletedAt: null,
            category: null,
            tags: [],
            alias: [],
            firstPublishedAt: new Date(),
            updatedAt: new Date(),
            createdAt: new Date(),
            commentsEnabled: true,
            showToc: true,
            showUpdated: false,
            publishedRevisionId: 1n,
            authorId: null,
            pinnedAt: null,
            og: null,
          },
        ] as any,
    )

    const { loadCatalogPostMetas } = await import('@/server/domains/posts/services/catalog')

    const first = await loadCatalogPostMetas(db)
    expect(first).toHaveLength(1)

    // Second call should use cache (no additional DB call within 10s TTL)
    const second = await loadCatalogPostMetas(db)
    expect(second).toHaveLength(1)
    expect(publicQuery.listPublicPostMetas).toHaveBeenCalledTimes(1)
  })

  it('mutation clears cache so next load hits DB', async () => {
    const publicQuery = await import('@/server/domains/posts/repos/public-query')
    const single = await import('@/server/domains/posts/repos/single')
    vi.mocked(publicQuery.listPublicPostMetas).mockImplementation(
      async () =>
        [
          {
            id: 1n,
            slug: 'hello',
            title: 'Hello',
            summary: '',
            cover: '',
            published: true,
            visible: true,
            publishedAt: new Date(),
            deletedAt: null,
            category: null,
            tags: [],
            alias: [],
            firstPublishedAt: new Date(),
            updatedAt: new Date(),
            createdAt: new Date(),
            commentsEnabled: true,
            showToc: true,
            showUpdated: false,
            publishedRevisionId: 1n,
            authorId: null,
            pinnedAt: null,
            og: null,
          },
        ] as any,
    )
    vi.mocked(single.findPostMetaBySlug).mockImplementation(async () => null)

    const { loadCatalogPostMetas } = await import('@/server/domains/posts/services/catalog')
    const { createPost } = await import('@/server/domains/posts/services/mutate')

    // Prime cache
    await loadCatalogPostMetas(db)
    expect(publicQuery.listPublicPostMetas).toHaveBeenCalledTimes(1)

    // Mutate
    await createPost(db, { title: 'New Post', summary: '', tags: [], category: undefined }, null)

    // Next load should hit DB again (cache was cleared)
    await loadCatalogPostMetas(db)
    expect(publicQuery.listPublicPostMetas).toHaveBeenCalledTimes(2)
  })

  it('multiple mutations in sequence clear cache each time', async () => {
    const publicQuery = await import('@/server/domains/posts/repos/public-query')
    const single = await import('@/server/domains/posts/repos/single')
    vi.mocked(publicQuery.listPublicPostMetas).mockImplementation(
      async () =>
        [
          {
            id: 1n,
            slug: 'hello',
            title: 'Hello',
            summary: '',
            cover: '',
            published: true,
            visible: true,
            publishedAt: new Date(),
            deletedAt: null,
            category: null,
            tags: [],
            alias: [],
            firstPublishedAt: new Date(),
            updatedAt: new Date(),
            createdAt: new Date(),
            commentsEnabled: true,
            showToc: true,
            showUpdated: false,
            publishedRevisionId: 1n,
            authorId: null,
            pinnedAt: null,
            og: null,
          },
        ] as any,
    )
    vi.mocked(single.findPostMetaBySlug).mockImplementation(async () => null)

    const { loadCatalogPostMetas } = await import('@/server/domains/posts/services/catalog')
    const { createPost } = await import('@/server/domains/posts/services/mutate')

    await loadCatalogPostMetas(db)
    expect(publicQuery.listPublicPostMetas).toHaveBeenCalledTimes(1)

    await createPost(db, { title: 'First', summary: '', tags: [], category: undefined }, null)
    await loadCatalogPostMetas(db)
    expect(publicQuery.listPublicPostMetas).toHaveBeenCalledTimes(2)

    await createPost(db, { title: 'Second', summary: '', tags: [], category: undefined }, null)
    await loadCatalogPostMetas(db)
    expect(publicQuery.listPublicPostMetas).toHaveBeenCalledTimes(3)
  })
})

describe('pages service cache clearing', () => {
  it('loadCatalogPages returns cached data within TTL', async () => {
    const pageRepo = await import('@/server/domains/pages/repo')
    vi.mocked(pageRepo.listPublicPageMetas).mockImplementation(
      async () =>
        [
          {
            id: 1n,
            slug: 'about',
            title: 'About',
            summary: '',
            cover: '',
            published: true,
            commentsEnabled: false,
            showToc: false,
            showUpdated: false,
            showFriends: false,
            og: null,
            publishedAt: new Date(),
            deletedAt: null,
            firstPublishedAt: new Date(),
            updatedAt: new Date(),
            createdAt: new Date(),
            publishedRevisionId: 1n,
            authorId: null,
          },
        ] as any,
    )

    const { loadCatalogPages } = await import('@/server/domains/pages/services/catalog')

    const first = await loadCatalogPages(db)
    expect(first).toHaveLength(1)

    const second = await loadCatalogPages(db)
    expect(second).toHaveLength(1)
    expect(pageRepo.listPublicPageMetas).toHaveBeenCalledTimes(1)
  })

  it('mutation clears cache so next load hits DB', async () => {
    const pageRepo = await import('@/server/domains/pages/repo')
    vi.mocked(pageRepo.listPublicPageMetas).mockImplementation(
      async () =>
        [
          {
            id: 1n,
            slug: 'about',
            title: 'About',
            summary: '',
            cover: '',
            published: true,
            commentsEnabled: false,
            showToc: false,
            showUpdated: false,
            showFriends: false,
            og: null,
            publishedAt: new Date(),
            deletedAt: null,
            firstPublishedAt: new Date(),
            updatedAt: new Date(),
            createdAt: new Date(),
            publishedRevisionId: 1n,
            authorId: null,
          },
        ] as any,
    )

    const { loadCatalogPages } = await import('@/server/domains/pages/services/catalog')
    const { createPage } = await import('@/server/domains/pages/services/mutate')

    // Prime cache
    await loadCatalogPages(db)
    expect(pageRepo.listPublicPageMetas).toHaveBeenCalledTimes(1)

    // Mutate
    await createPage(db, { title: 'New Page', summary: '', slug: 'new-page' }, null)

    // Next load should hit DB again
    await loadCatalogPages(db)
    expect(pageRepo.listPublicPageMetas).toHaveBeenCalledTimes(2)
  })
})
