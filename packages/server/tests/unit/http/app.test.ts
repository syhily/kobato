import type { Env } from '@kobato/server/http/context'

import { extractRequestFacts } from '@kobato/server/http/utils/request-facts'
import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'

let capturedContext: unknown
const handlerHandleMock =
  vi.fn<(_req: Request, opts: { context: any }) => Promise<{ matched: boolean; response?: Response }>>()

function RPCHandlerMock() {
  return { handle: handlerHandleMock }
}

vi.mock('@orpc/server/fetch', () => ({
  RPCHandler: RPCHandlerMock,
}))

vi.mock('@kobato/server/http/api-router', () => ({
  apiRouter: { mock: true },
}))

vi.mock('@kobato/server/http/middlewares/csrf', () => ({
  csrfGuard: vi.fn(async (_c: any, next: () => Promise<void>) => next()),
}))

vi.mock('@kobato/server/http/middlewares/dynamic-body-limit', () => ({
  dynamicBodyLimit: vi.fn(({ onError }: { onError?: (c: any) => Response }) => {
    return async (c: any, next: () => Promise<void>) => {
      const contentLength = Number(c.req.raw.headers.get('content-length') || '0')
      const maxSize = 10 * 1024 * 1024
      if (contentLength > maxSize) {
        if (onError) {
          return onError(c)
        }
        return c.text('Payload Too Large', 413)
      }
      await next()
    }
  }),
}))

describe('createApiApp', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    handlerHandleMock.mockReset()
  })

  // The RPC bridge projects `c.var.requestContext` (derived upstream by the
  // request-context middleware) into the oRPC HandlerContext — stub the
  // canonical context the way the perimeter would.
  async function makeApp() {
    const { createApiApp } = await import('@kobato/server/http/app')
    const app = new Hono<Env>()
    app.use('*', async (c, next) => {
      c.set('requestContext', {
        session: { id: 'session-1' },
        viewer: null,
        clientAddress: '127.0.0.1',
        requestFacts: extractRequestFacts(c.req.raw),
        db: {},
        pool: {},
      } as unknown as Env['Variables']['requestContext'])
      await next()
    })
    app.route('/', createApiApp())
    return app
  }

  it('creates a Hono app and returns 404 for unmatched RPC requests', async () => {
    handlerHandleMock.mockResolvedValue({ matched: false })

    const app = await makeApp()
    const res = await app.request('/rpc/unknown', { method: 'POST' })

    expect(res.status).toBe(404)
  })

  it('merges response headers and returns the RPC response on match', async () => {
    handlerHandleMock.mockImplementation(async (_req, opts) => {
      capturedContext = opts.context
      opts.context.responseHeaders.append('x-custom', 'yes')
      opts.context.responseHeaders.append('set-cookie', 'a=1')
      opts.context.responseHeaders.append('set-cookie', 'b=2')
      return {
        matched: true,
        response: new Response('{"ok":true}', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      }
    })

    const app = await makeApp()
    const res = await app.request('/rpc/test', {
      method: 'POST',
      body: '{}',
      headers: { 'content-type': 'application/json' },
    })

    expect(res.status).toBe(200)
    expect(res.headers.get('x-custom')).toBe('yes')
    expect(res.headers.getSetCookie()).toEqual(['a=1', 'b=2'])
    expect(capturedContext).toMatchObject({
      viewer: null,
      clientAddress: '127.0.0.1',
      session: { id: 'session-1' },
      responseHeaders: expect.any(Headers),
    })
  })

  it('rejects oversized requests with the custom error body', async () => {
    handlerHandleMock.mockResolvedValue({ matched: false })

    const app = await makeApp()
    const res = await app.request('/rpc/test', {
      method: 'POST',
      body: 'x',
      headers: { 'content-length': String(20 * 1024 * 1024) },
    })

    expect(res.status).toBe(413)
    const body = (await res.json()) as { error: { message: string } }
    expect(body.error.message).toBe('请求体过大')
  })
})
