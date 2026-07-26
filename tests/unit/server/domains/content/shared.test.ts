import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/server/infra/cache/registry', () => ({
  clear: vi.fn(),
}))

import { clearContentCaches } from '@/server/domains/content/shared'
import { clear } from '@/server/infra/cache/registry'

const clearMock = vi.mocked(clear)

// The db handle is only forwarded to the mocked cache module — a stand-in
// is enough for the unit scope.
const db = {} as NodePgDatabase

describe('clearContentCaches', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearMock.mockResolvedValue(undefined)
  })

  it('clears feed, taxonomy and sitemap caches for posts', async () => {
    await clearContentCaches(db, 'post', 42n)

    expect(clearMock).toHaveBeenCalledWith(db, 'feed')
    expect(clearMock).toHaveBeenCalledWith(db, 'tags')
    expect(clearMock).toHaveBeenCalledWith(db, 'categories')
    expect(clearMock).toHaveBeenCalledWith(db, 'sitemap')
    expect(clearMock).toHaveBeenCalledTimes(4)
  })

  it('clears only the sitemap cache for pages', async () => {
    await clearContentCaches(db, 'page', 42n)

    expect(clearMock).toHaveBeenCalledTimes(1)
    expect(clearMock).toHaveBeenCalledWith(db, 'sitemap')
  })
})
