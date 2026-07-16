import { RPCHandler } from '@orpc/server/fetch'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { makePublicCtx } from '#/_helpers/mock-ctx'

vi.mock('@/server/infra/rate-limit', () => ({
  tryResourceRateLimit: vi.fn(),
}))

import { publicProc, resourceRateLimit } from '@/server/http/orpc-base'
import { tryResourceRateLimit } from '@/server/infra/rate-limit'

const tryResourceRateLimitMock = vi.mocked(tryResourceRateLimit)

// Miniature router in the shape `orpc-base.ts` produces in production:
// a public procedure with the shared `resourceRateLimit` guard mounted
// via `.use()` after `.input()`/`.output()`.
const router = {
  ping: publicProc
    .route({ method: 'POST', path: '/ping' })
    .input(z.object({ msg: z.string().min(1).max(20) }))
    .output(z.object({ echoed: z.string() }))
    .use(resourceRateLimit)
    .handler(({ input }) => ({ echoed: input.msg })),
}

const handler = new RPCHandler(router)

async function callPing(input: unknown) {
  const result = await handler.handle(
    new Request('http://localhost/rpc/ping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ json: input }),
    }),
    { prefix: '/rpc', context: makePublicCtx() },
  )
  if (!result.matched) {
    throw new Error('No route matched for /ping')
  }
  return result.response
}

describe('resourceRateLimit oRPC middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    tryResourceRateLimitMock.mockResolvedValue({ count: 1, exceeded: false })
  })

  it('passes through under the budget, reading the client address from the context', async () => {
    const res = await callPing({ msg: 'hi' })

    expect(res.status).toBe(200)
    const body = (await res.json()) as { json: { echoed: string } }
    expect(body.json.echoed).toBe('hi')
    expect(tryResourceRateLimitMock).toHaveBeenCalledWith('127.0.0.1')
  })

  it('answers 429 with the ORPCError shape when exceeded', async () => {
    tryResourceRateLimitMock.mockResolvedValue({ count: 100, exceeded: true })

    const res = await callPing({ msg: 'hi' })

    expect(res.status).toBe(429)
    const text = await res.text()
    expect(text).toContain('TOO_MANY_REQUESTS')
    expect(text).toContain('请求过于频繁，请稍后再试。')
  })

  it('validates the input before the guard, matching the old inline order', async () => {
    tryResourceRateLimitMock.mockResolvedValue({ count: 100, exceeded: true })

    const res = await callPing({ msg: '' })

    // The guard used to be the first statement of the handler — after
    // input validation. An over-budget IP sending invalid input must
    // still see the validation error, not 429.
    expect(res.status).not.toBe(429)
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(res.status).toBeLessThan(500)
    expect(tryResourceRateLimitMock).not.toHaveBeenCalled()
  })
})
