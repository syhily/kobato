import { describe, expect, it, vi } from 'vitest'

// Pure unit pin for the post adapter's draft-preview access rule
// (CONTEXT.md "Draft preview": posts allow author and above). The
// side-effectful import graph is mocked so the suite stays DB-free.

vi.mock('@/server/domains/content/shared', () => ({
  clearContentCaches: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/server/domains/posts/repos/single', () => ({
  findPostMetaById: vi.fn(),
  findPublicPostMetaBySlug: vi.fn(),
}))

vi.mock('@/server/domains/posts/services/search-index', () => ({
  indexPost: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/server/infra/search/search', () => ({
  invalidateSearchCache: vi.fn().mockResolvedValue(undefined),
}))

const { postLifecycleAdapter } = await import('@/server/domains/posts/services/lifecycle-adapter')

describe('postLifecycleAdapter.canPreviewDraft', () => {
  it.each([
    { role: 'admin' as const, expected: true },
    { role: 'author' as const, expected: true },
    { role: 'visitor' as const, expected: false },
    { role: null, expected: false },
    { role: undefined, expected: false },
  ])('returns $expected for role $role', ({ role, expected }) => {
    expect(postLifecycleAdapter.canPreviewDraft(role)).toBe(expected)
  })
})
