import type { HandlerContext } from '@kobato/server/http/orpc-base.ts'

import { likesContract } from '@kobato/api/likes.ts'
import { likesRouter } from '@kobato/server/http/controllers/likes.controller.ts'
import { orpcInputValidationInterceptor } from '@kobato/server/http/orpc-base.ts'
import { makePublicCtx } from '@kobato/test/mock-ctx.ts'
import { getHiddenRouterContract } from '@orpc/server'
import { RPCHandler } from '@orpc/server/fetch'
import { describe, expect, it } from 'vitest'

// The controller is contract-first: every method/path/schema the wire exposes
// must come from `@kobato/api` — this suite pins that the implemented router
// carries exactly the contract, with no drift of its own.

interface ImplementedDef {
  route: { method?: string; path?: string }
  inputSchema: unknown
  outputSchema: unknown
  middlewares: readonly unknown[]
}

const LIKE_KEYS = ['increase', 'decrease', 'validate'] as const

function def(procedure: unknown): ImplementedDef {
  return (procedure as { '~orpc': ImplementedDef })['~orpc']
}

describe('likesRouter ⇄ likesContract parity', () => {
  it('exports the router under the hidden contract it implements', () => {
    expect(getHiddenRouterContract(likesRouter)).toBe(likesContract)
  })

  it('implements exactly the contract keys', () => {
    expect(Object.keys(likesRouter).sort()).toEqual(Object.keys(likesContract).sort())
  })

  it.each(LIKE_KEYS)('%s keeps the contract route method and path', (key) => {
    expect(def(likesRouter[key]).route).toEqual(likesContract[key]['~orpc'].route)
  })

  it.each(LIKE_KEYS)('%s validates through the contract schemas by reference', (key) => {
    expect(def(likesRouter[key]).inputSchema).toBe(likesContract[key]['~orpc'].inputSchema)
    expect(def(likesRouter[key]).outputSchema).toBe(likesContract[key]['~orpc'].outputSchema)
  })

  it('mounts the public base middleware exactly once per procedure', () => {
    // The implementer base contributes domainErrorGuard; `.router()` re-applies
    // the implementer middlewares but dedupes the leading run — a second copy
    // would double-translate errors, so the stack must stay length 1.
    for (const procedure of Object.values(likesRouter)) {
      expect(def(procedure).middlewares).toHaveLength(1)
    }
  })
})

// Wire-level proof through the same RPCHandler mount app.ts uses: the router
// keys resolve, and the CONTRACT's input schemas run before any handler work.
const handler = new RPCHandler<HandlerContext>(
  { likes: likesRouter },
  {
    clientInterceptors: [orpcInputValidationInterceptor],
  },
)

async function rpc(path: string, input: unknown) {
  const result = await handler.handle(
    new Request(`http://localhost/rpc${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ json: input }),
    }),
    { prefix: '/rpc', context: makePublicCtx() },
  )
  if (!result.matched) {
    throw new Error(`No route matched for ${path}`)
  }
  return result.response
}

describe('likesRouter wire validation', () => {
  it('rejects an increase without a key before any handler work', async () => {
    const res = await rpc('/likes/increase', {})
    expect(res.status).toBe(400)
    const body = (await res.json()) as { json: { code: string; message: string } }
    expect(body.json.code).toBe('BAD_REQUEST')
    expect(body.json.message).toContain('key')
  })

  it('rejects a decrease missing its token', async () => {
    const res = await rpc('/likes/decrease', { key: 'post:1' })
    expect(res.status).toBe(400)
  })

  it('rejects a validate with a non-string key', async () => {
    const res = await rpc('/likes/validate', { key: 1, token: 'tok' })
    expect(res.status).toBe(400)
  })

  it('does not match unknown procedure paths', async () => {
    const result = await handler.handle(
      new Request('http://localhost/rpc/likes/unknown', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ json: {} }),
      }),
      { prefix: '/rpc', context: makePublicCtx() },
    )
    expect(result.matched).toBe(false)
  })
})
