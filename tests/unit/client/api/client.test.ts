import { beforeEach, describe, expect, it, vi } from 'vitest'

const headersFn = vi.fn<() => Record<string, string>>()
const lastUrlFn = { current: null as (() => string) | null }
const lastInterceptors = {
  current: [] as Array<(options: { next: () => Promise<unknown> }) => Promise<unknown>>,
}

function RPCLinkMock(
  this: any,
  opts: {
    url: () => string
    headers: () => Record<string, string>
    interceptors?: Array<(options: { next: () => Promise<unknown> }) => Promise<unknown>>
  },
) {
  headersFn.mockImplementation(opts.headers)
  lastUrlFn.current = opts.url
  lastInterceptors.current = opts.interceptors ?? []
  this.url = opts.url
}

vi.mock('@orpc/client/fetch', () => ({
  RPCLink: RPCLinkMock,
}))

vi.mock('@orpc/client', () => ({
  createORPCClient: vi.fn(() => ({ mocked: true })),
}))

describe('client/api/client', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    headersFn.mockReset()
    lastUrlFn.current = null
    vi.resetModules()
  })

  it('exports a defined orpc client', async () => {
    const mod = await import('@/client/api/client')
    expect(mod.orpc).toBeDefined()
    expect(mod.orpc).toEqual({ mocked: true })
  })

  it('setCsrfToken causes the link headers callback to include X-CSRF-Token', async () => {
    const mod = await import('@/client/api/client')
    mod.setCsrfToken('test-token')
    const headers = headersFn()
    expect(headers['X-CSRF-Token']).toBe('test-token')
  })

  it('RPCLink url falls back to localhost when globalThis.location is undefined', async () => {
    await import('@/client/api/client')
    expect(lastUrlFn.current?.()).toBe('http://localhost/rpc')
  })

  it('RPCLink url uses globalThis.location.origin when available', async () => {
    const originalLocation = globalThis.location
    globalThis.location = { origin: 'https://example.com' } as Location
    try {
      // Force a fresh module evaluation so RPCLink is constructed with the stub.
      vi.resetModules()
      await import('@/client/api/client')
      expect(lastUrlFn.current?.()).toBe('https://example.com/rpc')
    } finally {
      globalThis.location = originalLocation
      vi.resetModules()
    }
  })
})

describe('client/api/client — error interceptor', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetModules()
    await import('@/client/api/client')
  })

  it('folds a rejection’s zod-issue list into the error message', async () => {
    const err = Object.assign(new Error('设置数据无效'), {
      data: [{ message: '最大尝试次数不能超过 1000', path: ['resource', 'maxAttempts'] }],
    })
    const interceptor = lastInterceptors.current[0]!
    await expect(interceptor({ next: () => Promise.reject(err) })).rejects.toBe(err)
    expect(err.message).toBe('设置数据无效：resource.maxAttempts：最大尝试次数不能超过 1000')
  })

  it('rethrows issue-less errors untouched', async () => {
    const err = new Error('请求过于频繁，请稍后再试。')
    const interceptor = lastInterceptors.current[0]!
    await expect(interceptor({ next: () => Promise.reject(err) })).rejects.toBe(err)
    expect(err.message).toBe('请求过于频繁，请稍后再试。')
  })

  it('passes a successful call through', async () => {
    const interceptor = lastInterceptors.current[0]!
    await expect(interceptor({ next: () => Promise.resolve({ ok: true }) })).resolves.toEqual({ ok: true })
  })
})
