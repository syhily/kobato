import { getTestDb } from '@kobato/server/tests/utils/integration-db.ts'
import { makePublicCtx } from '@kobato/server/tests/utils/mock-ctx.ts'
import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '@kobato/settings/tests/utils/blog-settings.ts'
import { call } from '@orpc/server'
import { beforeEach, describe, expect, it } from 'vitest'

const { avatarRouter } = await import('@kobato/server/http/controllers/avatar.controller.ts')
const { __resetRateLimitsForTests } = await import('@kobato/server/infra/rate-limit.ts')

const db = getTestDb()

describe('avatarRouter.find', () => {
  beforeEach(() => {
    __resetRateLimitsForTests()
    setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
  })

  it('returns a hash-based avatar path', async () => {
    const ctx = makePublicCtx({ db })
    const res = await call(avatarRouter.find, { email: 'user@example.com' }, { context: ctx })
    expect(res.avatar).toMatch(/^\/images\/avatar\/[0-9a-f]{64}\.png\?s=120$/)
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
