import { getTestDb } from '@kobato/server/tests/utils/integration-db'
import { makePublicCtx } from '@kobato/server/tests/utils/mock-ctx'
import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '@kobato/settings/tests/utils/blog-settings'
import { call } from '@orpc/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { avatarRouter } = await import('@kobato/server/http/controllers/public/avatar.controller')
const { __resetRateLimitsForTests } = await import('@kobato/server/infra/rate-limit')

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

describe('avatarRouter.image', () => {
  beforeEach(() => {
    __resetRateLimitsForTests()
    setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
  })

  const callImage = (input: { hash: string; size?: string }, clientAddress?: string) =>
    call(avatarRouter.image, input, {
      context: makePublicCtx({ db, ...(clientAddress === undefined ? {} : { clientAddress }) }),
    })

  it('answers the default-avatar redirect envelope for an unknown hash', async () => {
    const answer = await callImage({ hash: 'abcdef0123456789' })
    expect(answer).toEqual({
      kind: 'redirect',
      location: '/images/default-avatar.png',
      cacheControl: null,
    })
  })

  it('redirects an empty hash without touching the avatar chain', async () => {
    const answer = await callImage({ hash: '' })
    expect(answer).toMatchObject({ kind: 'redirect' })
  })

  it('buckets the per-avatar key on the lowercased hash — five per second', async () => {
    for (let i = 0; i < 5; i += 1) {
      expect((await callImage({ hash: 'ABCDEF0123456789' })).kind).toBe('redirect')
    }
    await expect(callImage({ hash: 'abcdef0123456789' })).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' })
    expect((await callImage({ hash: 'fedcba9876543210' })).kind).toBe('redirect')
  })

  it('keeps distinct hashes on independent keyed windows behind one IP bucket', async () => {
    for (let i = 0; i < 5; i += 1) {
      expect((await callImage({ hash: '1111111111111111' }, '203.0.113.9')).kind).toBe('redirect')
    }
    await expect(callImage({ hash: '1111111111111111' }, '203.0.113.9')).rejects.toMatchObject({
      code: 'TOO_MANY_REQUESTS',
    })
    expect((await callImage({ hash: '2222222222222222' }, '203.0.113.9')).kind).toBe('redirect')
  })

  it('threads the ?s= size query into the domain default bucket', async () => {
    const sizeSpy = await import('@kobato/server/domains/comments/services/avatar')
    const serve = vi.spyOn(sizeSpy, 'serveAvatar')
    serve.mockResolvedValue({ kind: 'redirect' })
    try {
      await callImage({ hash: 'abc', size: '256' })
      expect(serve).toHaveBeenCalledWith(expect.anything(), 'abc', 256)
      serve.mockClear()
      await callImage({ hash: 'abc' })
      expect(serve).toHaveBeenCalledWith(expect.anything(), 'abc', 128)
    } finally {
      serve.mockRestore()
    }
  })
})
