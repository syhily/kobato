import { call } from '@orpc/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { makePublicCtx } from '#/_helpers/mock-ctx'

vi.mock('@/server/infra/rate-limit', () => ({
  tryResourceRateLimit: vi.fn().mockResolvedValue({ exceeded: false }),
}))

vi.mock('@/server/domains/comments/services/avatar', () => ({
  // Delegate to the real email hash so the hash-shape / determinism
  // assertions below keep their bite; the fetch-and-cache orchestration
  // inside the domain service is covered by its own unit tests.
  resolveAvatarForEmail: vi.fn(async (_db: unknown, email: string) => {
    const { encodedEmail } = await import('@/shared/utils/security')
    return encodedEmail(email)
  }),
}))

vi.mock('@/shared/config/getters', () => ({
  requireBlogSettingsSection: (section: string) => {
    if (section === 'siteIdentity') {
      return { website: 'https://example.test' }
    }
    return {}
  },
}))

const { avatarRouter } = await import('@/server/http/controllers/avatar.controller')

describe('avatarRouter.find', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
