import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Database } from '@/server/infra/db/database'

vi.mock('@/server/infra/cache/registry', () => ({
  clear: vi.fn(),
  bumpCounter: vi.fn(),
}))

import { invalidateContent } from '@/server/domains/content/invalidate'
import { bumpCounter, clear } from '@/server/infra/cache/registry'

const clearMock = vi.mocked(clear)
const bumpCounterMock = vi.mocked(bumpCounter)

// The db handle is only forwarded to the mocked cache module — a stand-in
// is enough for the unit scope.
const db = {} as Database

describe('invalidateContent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearMock.mockResolvedValue(undefined)
    bumpCounterMock.mockResolvedValue(undefined)
  })

  it('post clears feed, taxonomy and sitemap buckets and bumps the search generation', async () => {
    await invalidateContent(db, { entity: 'post' })

    expect(clearMock).toHaveBeenCalledWith(db, 'feed')
    expect(clearMock).toHaveBeenCalledWith(db, 'tags')
    expect(clearMock).toHaveBeenCalledWith(db, 'categories')
    expect(clearMock).toHaveBeenCalledWith(db, 'sitemap')
    expect(clearMock).toHaveBeenCalledTimes(4)
    expect(bumpCounterMock).toHaveBeenCalledTimes(1)
    expect(bumpCounterMock).toHaveBeenCalledWith(db, 'searchResult')
  })

  it('page clears only the sitemap bucket', async () => {
    await invalidateContent(db, { entity: 'page' })

    expect(clearMock).toHaveBeenCalledTimes(1)
    expect(clearMock).toHaveBeenCalledWith(db, 'sitemap')
    expect(bumpCounterMock).not.toHaveBeenCalled()
  })

  it('category clears the category list and the whole feed bucket', async () => {
    await invalidateContent(db, { entity: 'category' })

    expect(clearMock).toHaveBeenCalledTimes(2)
    expect(clearMock).toHaveBeenCalledWith(db, 'categories')
    expect(clearMock).toHaveBeenCalledWith(db, 'feed')
    expect(bumpCounterMock).not.toHaveBeenCalled()
  })

  it('tag clears the tag list and the whole feed bucket', async () => {
    await invalidateContent(db, { entity: 'tag' })

    expect(clearMock).toHaveBeenCalledTimes(2)
    expect(clearMock).toHaveBeenCalledWith(db, 'tags')
    expect(clearMock).toHaveBeenCalledWith(db, 'feed')
    expect(bumpCounterMock).not.toHaveBeenCalled()
  })

  it('comment clears only the comments bucket', async () => {
    await invalidateContent(db, { entity: 'comment' })

    expect(clearMock).toHaveBeenCalledTimes(1)
    expect(clearMock).toHaveBeenCalledWith(db, 'comments')
    expect(bumpCounterMock).not.toHaveBeenCalled()
  })
})
