import { beforeEach, describe, expect, it, vi } from 'vitest'

import { adminSession, regularSession } from '#/_helpers/session'

const mockDb = {} as any

vi.mock('@/server/domains/comments/services/public-query', () => ({
  latestComments: vi.fn(),
}))

const publicQuery = await import('@/server/domains/comments/services/public-query')
const { loadSidebarData } = await import('@/server/http/loaders/sidebar')

beforeEach(() => {
  vi.mocked(publicQuery.latestComments).mockReset()
  vi.mocked(publicQuery.latestComments).mockResolvedValue([
    {
      title: 'Hello',
      author: 'Alice',
      authorLink: '',
      permalink: '/posts/hello#user-comment-1',
    },
  ])
})

describe('services/sidebar/load — loadSidebarData', () => {
  it('non-admin session reports admin=false and returns latest comments', async () => {
    const data = await loadSidebarData(mockDb, regularSession())

    expect(data.admin).toBe(false)
    expect(data.recentComments).toHaveLength(1)
  })

  it('admin session reports admin=true and returns latest comments', async () => {
    const data = await loadSidebarData(mockDb, adminSession())

    expect(data.admin).toBe(true)
    expect(data.recentComments).toHaveLength(1)
  })
})
