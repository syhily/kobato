import { describe, expect, it, vi } from 'vitest'

// Pure unit pin for the page adapter's draft-preview access rule
// (CONTEXT.md "Draft preview": pages allow admin only). The
// side-effectful import graph is mocked so the suite stays DB-free.

vi.mock('@/server/domains/content/invalidate', () => ({
  invalidateContent: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/server/domains/pages/repo', () => ({
  findPageMetaById: vi.fn(),
  findPageMetaBySlug: vi.fn(),
  findPageMetaBySlugForUpdate: vi.fn(),
  insertPageMeta: vi.fn(),
  updatePageMetaById: vi.fn(),
  softDeletePageMeta: vi.fn(),
  restorePageMeta: vi.fn(),
}))

vi.mock('@/server/domains/pages/services/public-query', () => ({
  findPublicPageMetaBySlug: vi.fn(),
}))

const { pageLifecycleAdapter } = await import('@/server/domains/pages/services/lifecycle-adapter')

describe('pageLifecycleAdapter.canPreviewDraft', () => {
  it.each([
    { role: 'admin' as const, expected: true },
    { role: 'author' as const, expected: false },
    { role: 'visitor' as const, expected: false },
    { role: null, expected: false },
    { role: undefined, expected: false },
  ])('returns $expected for role $role', ({ role, expected }) => {
    expect(pageLifecycleAdapter.canPreviewDraft(role)).toBe(expected)
  })
})
