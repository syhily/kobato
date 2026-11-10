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

describe('client/api/client — error handling', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetModules()
    await import('@/client/api/client')
  })

  /** Run a rejection through whatever interceptors the link registers. */
  async function rejectThroughLink(error: unknown): Promise<unknown> {
    const chain = [...lastInterceptors.current]
    const run = async (index: number): Promise<unknown> => {
      const interceptor = chain[index]
      if (interceptor === undefined) {
        throw error
      }
      return interceptor({ next: () => run(index + 1) })
    }
    return run(0)
  }

  it('installs no rejection interceptor — the server owns error copy', () => {
    // A client-side fold would re-run per locale-less request, duplicate the
    // server's issue summary and drop the request locale.
    expect(lastInterceptors.current).toEqual([])
  })

  it('leaves a descriptor rejection’s server-folded message untouched (never re-appends issues)', async () => {
    const message = '设置数据无效：signIn.windowSeconds：时间窗口不能小于 60 秒'
    const err = Object.assign(new Error(message), {
      data: {
        descriptor: { messageKey: 'admin.settings.errors.invalid', fallbackMessage: 'The settings data is invalid' },
        issues: [
          {
            messageKey: 'admin.settings.rateLimit.error.windowMin',
            fallbackMessage: 'The time window must be at least 60 seconds',
            path: ['signIn', 'windowSeconds'],
          },
        ],
      },
    })

    await expect(rejectThroughLink(err)).rejects.toBe(err)
    expect(err.message).toBe(message)
  })

  it('keeps a legacy bare-array rejection’s server message as-is', async () => {
    const err = Object.assign(new Error('设置数据无效'), {
      data: [{ message: '最大尝试次数不能超过 1000', path: ['resource', 'maxAttempts'] }],
    })

    await expect(rejectThroughLink(err)).rejects.toBe(err)
    // No client-side folding: the server message is the fallback.
    expect(err.message).toBe('设置数据无效')
  })

  it('rethrows issue-less errors untouched', async () => {
    const err = new Error('请求过于频繁，请稍后再试。')
    await expect(rejectThroughLink(err)).rejects.toBe(err)
    expect(err.message).toBe('请求过于频繁，请稍后再试。')
  })
})
