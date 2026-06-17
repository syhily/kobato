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

vi.mock('@/server/http/api-router', () => ({
  apiRouter: { mock: true },
}))

vi.mock('@/server/http/middlewares/csrf', () => ({
  csrfGuard: vi.fn(async (_c: any, next: () => Promise<void>) => next()),
}))

vi.mock('@/server/http/middlewares/dynamic-body-limit', () => ({
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

vi.mock('@/shared/config/getters', () => ({
  getBlogSettingsBundleSync: vi.fn(() => ({
    limits: { maxRequestBodySize: 10 * 1024 * 1024 },
  })),
}))

describe('createApiApp', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    handlerHandleMock.mockReset()
  })

  it('creates a Hono app and returns 404 for unmatched RPC requests', async () => {
    handlerHandleMock.mockResolvedValue({ matched: false })

    const { createApiApp } = await import('@/server/http/app')
    const app = createApiApp()
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

    const { createApiApp } = await import('@/server/http/app')
    const app = createApiApp()
    const res = await app.request('/rpc/test', {
      method: 'POST',
      body: '{}',
      headers: { 'content-type': 'application/json' },
    })

    expect(res.status).toBe(200)
    expect(res.headers.get('x-custom')).toBe('yes')
    expect(res.headers.getSetCookie()).toEqual(['a=1', 'b=2'])
    expect(capturedContext).toMatchObject({
      responseHeaders: expect.any(Headers),
    })
  })

  it('rejects oversized requests with the custom error body', async () => {
    handlerHandleMock.mockResolvedValue({ matched: false })

    const { createApiApp } = await import('@/server/http/app')
    const app = createApiApp()
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
