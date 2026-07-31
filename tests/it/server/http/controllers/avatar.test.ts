import { call } from '@orpc/server'
import { beforeEach, describe, expect, it } from 'vitest'

import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '#/_helpers/blog-settings'
import { getTestDb } from '#/_helpers/integration-db'
import { makePublicCtx } from '#/_helpers/mock-ctx'

const { avatarRouter } = await import('@/server/http/controllers/avatar.controller')
const { __resetRateLimitsForTests } = await import('@/server/infra/rate-limit')

const db = getTestDb()

describe('avatarRouter.find', () => {
  beforeEach(() => {
    __resetRateLimitsForTests()
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      siteIdentity: { ...TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!, website: 'https://example.test' },
    })
  })

  it('returns a hash-based avatar path', async () => {
    const ctx = makePublicCtx({ db })
    const res = await call(avatarRouter.find, { email: 'user@example.com' }, { context: ctx })
    expect(res.avatar).toMatch(/^https:\/\/example\.test\/images\/avatar\/[0-9a-f]{64}\.png\?s=120$/)
  })

  it('returns different paths for different emails', async () => {
    const ctx = makePublicCtx({ db })
    const a = await call(avatarRouter.find, { email: 'a@example.com' }, { context: ctx })
    const b = await call(avatarRouter.find, { email: 'b@example.com' }, { context: ctx })
    expect(a.avatar).not.toBe(b.avatar)
  })

  it('returns the same path for the same email', async () => {
    const ctx = makePublicCtx({ db })
    const a = await call(avatarRouter.find, { email: 'same@example.com' }, { context: ctx })
    const b = await call(avatarRouter.find, { email: 'same@example.com' }, { context: ctx })
    expect(a.avatar).toBe(b.avatar)
  })

  it('never returns a numeric user id in the path', async () => {
    const ctx = makePublicCtx({ db })
    const res = await call(avatarRouter.find, { email: 'registered@example.com' }, { context: ctx })
    expect(res.avatar).not.toMatch(/\/\d+\.png$/)
  })
})
