import { beforeEach, describe, expect, it, vi } from 'vitest'

const linkOptions = { current: null as Record<string, unknown> | null }
const lastLink = { current: null as unknown }

function RPCLinkMock(this: any, options: Record<string, unknown>) {
  linkOptions.current = options
  lastLink.current = this
}

function createORPCClientMock(link: unknown) {
  return { mocked: true, link }
}

vi.mock('@orpc/client/fetch', () => ({
  RPCLink: RPCLinkMock,
}))

vi.mock('@orpc/client', () => ({
  createORPCClient: createORPCClientMock,
}))

async function loadFactory(): Promise<typeof import('@kobato/api/client/create-client')> {
  return import('@kobato/api/client/create-client')
}

describe('api/client/create-client', () => {
  beforeEach(() => {
    vi.resetModules()
    linkOptions.current = null
    lastLink.current = null
  })

  it('assembles the client from createORPCClient over the constructed RPCLink', async () => {
    const { createKobatoClient } = await loadFactory()
    const client = createKobatoClient({ url: 'https://example.com/rpc' })
    expect(client).toEqual({ mocked: true, link: lastLink.current })
    expect(linkOptions.current).not.toBeNull()
  })

  it('passes a static full RPC URL through to the link', async () => {
    const { createKobatoClient } = await loadFactory()
    createKobatoClient({ url: 'https://example.com/rpc' })
    expect(linkOptions.current!.url).toBe('https://example.com/rpc')
  })

  it('forwards a dynamic url function untouched (no eager evaluation)', async () => {
    const { createKobatoClient } = await loadFactory()
    const url = () => `${globalThis.location?.origin ?? 'http://localhost'}/rpc`
    createKobatoClient({ url })
    expect(linkOptions.current!.url).toBe(url)
  })

  it('delegates to globalThis.fetch by default, resolved at call time', async () => {
    const { createKobatoClient } = await loadFactory()
    createKobatoClient({ url: 'https://example.com/rpc' })
    const fetchImpl = linkOptions.current!.fetch as (request: Request, init: unknown) => Promise<Response>

    const fetchMock = vi.fn(() => Promise.resolve({ ok: true } as Response))
    vi.stubGlobal('fetch', fetchMock)
    try {
      const request = {} as Request
      const init = { redirect: 'error' as const }
      await fetchImpl(request, init)
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock).toHaveBeenCalledWith(request, init)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('uses a custom fetch as-is', async () => {
    const { createKobatoClient } = await loadFactory()
    const customFetch = vi.fn(() => Promise.resolve({} as Response))
    createKobatoClient({ url: 'https://example.com/rpc', fetch: customFetch })
    expect(linkOptions.current!.fetch).toBe(customFetch)
  })

  it('maps getHeaders onto the link headers option untouched', async () => {
    const { createKobatoClient } = await loadFactory()
    const getHeaders = () => ({ 'X-CSRF-Token': 'token' })
    createKobatoClient({ url: 'https://example.com/rpc', getHeaders })
    expect(linkOptions.current!.headers).toBe(getHeaders)
  })

  it('leaves the link headers unset when getHeaders is omitted', async () => {
    const { createKobatoClient } = await loadFactory()
    createKobatoClient({ url: 'https://example.com/rpc' })
    expect(linkOptions.current!.headers).toBeUndefined()
  })
})

describe('api/client/create-client — transport rejection passthrough', () => {
  type LinkInterceptor = (options: { next: () => Promise<unknown> }) => Promise<unknown>

  beforeEach(() => {
    vi.resetModules()
    linkOptions.current = null
    lastLink.current = null
  })

  async function assembleLink(): Promise<void> {
    const { createKobatoClient } = await loadFactory()
    createKobatoClient({ url: 'https://example.com/rpc' })
  }

  async function rejectThroughLink(error: unknown): Promise<unknown> {
    const chain = [...((linkOptions.current!.interceptors as LinkInterceptor[] | undefined) ?? [])]
    const run = async (index: number): Promise<unknown> => {
      const interceptor = chain[index]
      if (interceptor === undefined) {
        throw error
      }
      return interceptor({ next: () => run(index + 1) })
    }
    return run(0)
  }

  it('installs no rejection interceptor — the server owns error copy', async () => {
    await assembleLink()
    expect(linkOptions.current!.interceptors).toBeUndefined()
  })

  it('leaves a descriptor rejection’s server-folded message untouched (never re-appends issues)', async () => {
    await assembleLink()
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
    await assembleLink()
    const err = Object.assign(new Error('设置数据无效'), {
      data: [{ message: '最大尝试次数不能超过 1000', path: ['resource', 'maxAttempts'] }],
    })

    await expect(rejectThroughLink(err)).rejects.toBe(err)
    expect(err.message).toBe('设置数据无效')
  })

  it('rethrows issue-less errors untouched', async () => {
    await assembleLink()
    const err = new Error('请求过于频繁，请稍后再试。')

    await expect(rejectThroughLink(err)).rejects.toBe(err)
    expect(err.message).toBe('请求过于频繁，请稍后再试。')
  })
})
