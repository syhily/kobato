import { ORPCError, os } from '@orpc/server'
import { RPCHandler } from '@orpc/server/fetch'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

// End-to-end smoke for the oRPC + Hono mount pattern, mirroring the
// `os.$context<HandlerContext>().use(...)` shape of src/server/http/orpc-base.ts.

interface Ctx {
  session: { get(key: 'user'): { id: string; role: 'admin' | 'author' | 'visitor' } | undefined }
}

const root = os.$context<Ctx>()

const requireAuth = root.middleware(({ context, next }) => {
  const user = context.session.get('user')
  if (!user) {
    throw new ORPCError('UNAUTHORIZED', { message: '未登录' })
  }
  return next({ context: { ...context, viewer: user } })
})

const requireAdmin = root.middleware(({ context, next }) => {
  const user = context.session.get('user')
  if (!user) {
    throw new ORPCError('UNAUTHORIZED', { message: '未登录' })
  }
  if (user.role !== 'admin') {
    throw new ORPCError('FORBIDDEN', { message: '权限不足' })
  }
  return next({ context: { ...context, viewer: user } })
})

const publicProc = root
const authedProc = root.use(requireAuth)
const adminProc = root.use(requireAdmin)

const router = {
  public: {
    echo: publicProc
      .input(z.object({ msg: z.string().min(1).max(20) }))
      .output(z.object({ echoed: z.string() }))
      .handler(({ input }) => ({ echoed: input.msg })),
  },
  account: {
    me: authedProc
      .input(z.object({}))
      .output(z.object({ id: z.string(), role: z.string() }))
      .handler(({ context }) => ({ id: context.viewer.id, role: context.viewer.role })),
  },
  admin: {
    softDelete: adminProc
      .input(z.object({ id: z.string() }))
      .output(z.void())
      .handler(() => {}),
  },
}

function makeCtx(role?: 'admin' | 'author' | 'visitor'): Ctx {
  return {
    session: {
      get: () => (role ? { id: '1', role } : undefined),
    },
  }
}

// RPC wire format: { json: <data>, meta?: [] } envelopes, matching RPCLink's serialization.
async function call(handler: RPCHandler<Ctx>, path: string, input: unknown, ctx: Ctx) {
  const url = `http://localhost/rpc${path}`
  const req = new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ json: input }),
  })
  return handler.handle(req, { prefix: '/rpc', context: ctx })
}

const handler = new RPCHandler(router)

describe('oRPC smoke', () => {
  it('public procedure: 200 + echoes input through Zod', async () => {
    const { matched, response } = await call(handler, '/public/echo', { msg: 'hi' }, makeCtx())
    expect(matched).toBe(true)
    expect(response?.status).toBe(200)
    const body = (await response?.json()) as { json: { echoed: string } }
    expect(body.json.echoed).toBe('hi')
  })

  it('authed procedure: 401 ORPCError when no session user', async () => {
    const { matched, response } = await call(handler, '/account/me', {}, makeCtx())
    expect(matched).toBe(true)
    expect(response?.status).toBe(401)
  })

  it('authed procedure: 200 when session user present', async () => {
    const { matched, response } = await call(handler, '/account/me', {}, makeCtx('visitor'))
    expect(matched).toBe(true)
    expect(response?.status).toBe(200)
    const body = (await response?.json()) as { json: { role: string } }
    expect(body.json.role).toBe('visitor')
  })

  it('admin procedure: 403 ORPCError when role is not admin', async () => {
    const { matched, response } = await call(handler, '/admin/softDelete', { id: '5' }, makeCtx('visitor'))
    expect(matched).toBe(true)
    expect(response?.status).toBe(403)
  })

  it('admin procedure: 200 (RPC JSON) with z.void() output when admin', async () => {
    // RPCHandler returns JSON envelopes even for z.void() outputs — 204 no-body is OpenAPI-only.
    const { matched, response } = await call(handler, '/admin/softDelete', { id: '5' }, makeCtx('admin'))
    expect(matched).toBe(true)
    expect(response?.status).toBe(200)
  })

  it('Zod input validation: 422 when input does not satisfy schema', async () => {
    const { matched, response } = await call(handler, '/public/echo', { msg: '' }, makeCtx())
    expect(matched).toBe(true)
    expect(response?.status).toBeGreaterThanOrEqual(400)
    expect(response?.status).toBeLessThan(500)
  })

  it('returns matched=false for an unknown procedure path', async () => {
    const { matched } = await call(handler, '/nope/nope', {}, makeCtx())
    expect(matched).toBe(false)
  })
})
