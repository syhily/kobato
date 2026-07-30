import { call } from '@orpc/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '#/_helpers/blog-settings'
import { makePublicCtx } from '#/_helpers/mock-ctx'

vi.mock('@/server/domains/comments/services/avatar', () => ({
  // Delegate to the real email hash so the hash-shape / determinism
  // assertions below keep their bite; the fetch-and-cache orchestration
  // inside the domain service is covered by its own unit tests.
  resolveAvatarForEmail: vi.fn(async (_db: unknown, email: string) => {
    const { encodedEmail } = await import('@/shared/utils/security')
    return encodedEmail(email)
  }),
}))

const { avatarRouter } = await import('@/server/http/controllers/avatar.controller')
const { __resetRateLimitsForTests } = await import('@/server/infra/rate-limit')

describe('avatarRouter.find', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    __resetRateLimitsForTests()
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      siteIdentity: { ...TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!, website: 'https://example.test' },
    })
  })

  it('returns a hash-based avatar path', async () => {
    const ctx = makePublicCtx()
    const res = await call(avatarRouter.find, { email: 'user@example.com' }, { context: ctx })
    expect(res.avatar).toMatch(/^https:\/\/example\.test\/images\/avatar\/[0-9a-f]{64}\.png\?s=120$/)
  })

  it('returns different paths for different emails', async () => {
    const ctx = makePublicCtx()
    const a = await call(avatarRouter.find, { email: 'a@example.com' }, { context: ctx })
    const b = await call(avatarRouter.find, { email: 'b@example.com' }, { context: ctx })
    expect(a.avatar).not.toBe(b.avatar)
  })

  it('returns the same path for the same email', async () => {
    const ctx = makePublicCtx()
    const a = await call(avatarRouter.find, { email: 'same@example.com' }, { context: ctx })
    const b = await call(avatarRouter.find, { email: 'same@example.com' }, { context: ctx })
    expect(a.avatar).toBe(b.avatar)
  })

  it('never returns a numeric user id in the path', async () => {
    const ctx = makePublicCtx()
    const res = await call(avatarRouter.find, { email: 'registered@example.com' }, { context: ctx })
    expect(res.avatar).not.toMatch(/\/\d+\.png$/)
  })
})
