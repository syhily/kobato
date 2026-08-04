import { beforeEach, describe, expect, it, vi } from 'vitest'

const headersFn = vi.fn<() => Record<string, string>>()
const lastUrlFn = { current: null as (() => string) | null }

function RPCLinkMock(this: any, opts: { url: () => string; headers: () => Record<string, string> }) {
  // Capture the headers callback so tests can inspect it.
  headersFn.mockImplementation(opts.headers)
  lastUrlFn.current = opts.url
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
    const mod = await import('@kobato/client/api/client')
    expect(mod.orpc).toBeDefined()
    expect(mod.orpc).toEqual({ mocked: true })
  })

  it('setCsrfToken causes the link headers callback to include X-CSRF-Token', async () => {
    const mod = await import('@kobato/client/api/client')
    mod.setCsrfToken('test-token')
    const headers = headersFn()
    expect(headers['X-CSRF-Token']).toBe('test-token')
  })

  it('RPCLink url falls back to localhost when globalThis.location is undefined', async () => {
    await import('@kobato/client/api/client')
    expect(lastUrlFn.current?.()).toBe('http://localhost/rpc')
  })

  it('RPCLink url uses globalThis.location.origin when available', async () => {
    const originalLocation = globalThis.location
    globalThis.location = { origin: 'https://example.com' } as Location
    try {
      // Force a fresh module evaluation so RPCLink is constructed with the stub.
      vi.resetModules()
      await import('@kobato/client/api/client')
      expect(lastUrlFn.current?.()).toBe('https://example.com/rpc')
    } finally {
      globalThis.location = originalLocation
      vi.resetModules()
    }
  })
})
