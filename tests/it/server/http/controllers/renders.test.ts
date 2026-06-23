import { call } from '@orpc/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { makeAuthedCtx, makePublicCtx } from '#/_helpers/mock-ctx'

vi.mock('@/server/infra/rendering/katex-renderer', () => ({
  getKatexRenderer: vi.fn(),
}))

vi.mock('@/server/infra/rate-limit', () => ({
  tryRenderRateLimit: vi.fn(),
}))

const { getKatexRenderer } = await import('@/server/infra/rendering/katex-renderer')
const { tryRenderRateLimit } = await import('@/server/infra/rate-limit')
const { rendersRouter } = await import('@/server/http/controllers/renders.controller')

const NOT_EXCEEDED = { count: 1, exceeded: false }

describe('rendersRouter.math', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: every public caller is under the limit. Individual tests
    // override with mockResolvedValueOnce for the exceed/admin cases.
    vi.mocked(tryRenderRateLimit).mockResolvedValue(NOT_EXCEEDED)
  })

  it('returns empty mathml for empty tex', async () => {
    const ctx = makePublicCtx()
    const res = await call(rendersRouter.math, { tex: '' }, { context: ctx })
    expect(res.mathml).toBe('')
    expect(res.error).toBeNull()
  })

  it('returns rendered mathml for valid tex', async () => {
    vi.mocked(getKatexRenderer).mockResolvedValueOnce({
      render: vi.fn().mockResolvedValue('<mathml>\\frac{1}{2}</mathml>'),
    })
    const ctx = makePublicCtx()
    const res = await call(rendersRouter.math, { tex: '\\frac{1}{2}' }, { context: ctx })
    expect(res.mathml).toBe('<mathml>\\frac{1}{2}</mathml>')
    expect(res.error).toBeNull()
  })

  it('rate-limits anonymous callers by IP', async () => {
    vi.mocked(tryRenderRateLimit).mockResolvedValueOnce({ count: 61, exceeded: true })
    const ctx = makePublicCtx({ clientAddress: '203.0.113.9' })
    await expect(call(rendersRouter.math, { tex: 'x^2' }, { context: ctx })).rejects.toThrowError(/渲染请求过于频繁/)
    expect(tryRenderRateLimit).toHaveBeenCalledWith('203.0.113.9')
  })

  it('skips the rate limit for admins', async () => {
    vi.mocked(getKatexRenderer).mockResolvedValueOnce({
      render: vi.fn().mockResolvedValue('<mathml>x</mathml>'),
    })
    const ctx = makeAuthedCtx({ role: 'admin' })
    await call(rendersRouter.math, { tex: 'x' }, { context: ctx })
    expect(tryRenderRateLimit).not.toHaveBeenCalled()
  })
})
