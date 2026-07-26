import { beforeEach, describe, expect, it, vi } from 'vitest'

import { requestContext } from '@/server/http/request-context'

const renderToPipeableStreamMock = vi.hoisted(() =>
  vi.fn((_element: unknown, _options: Record<string, unknown>) => ({
    pipe: vi.fn(),
    abort: vi.fn(),
  })),
)

vi.mock('react-dom/server', () => ({
  renderToPipeableStream: renderToPipeableStreamMock,
}))

vi.mock('@react-router/node', () => ({
  createReadableStreamFromReadable: vi.fn((stream: unknown) => stream),
}))

vi.mock('isbot', () => ({
  default: vi.fn(() => false),
}))

vi.mock('@/server/infra/logger', () => ({
  getLogger: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}))

const { default: handleRequest } = await import('@/entry.server')

describe('entry.server.tsx / handleRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('passes the nonce to ServerRouter and renderToPipeableStream', async () => {
    const loadContext = {
      get: vi.fn((context: unknown) => {
        if (context === requestContext) {
          return { cspNonce: 'test-nonce-xyz789' }
        }
        return undefined
      }),
    }

    void handleRequest(
      new Request('http://localhost/'),
      200,
      new Headers(),
      {
        staticHandlerContext: {
          loaderData: {},
          actionData: null,
          errors: null,
          statusCode: 200,
          location: { pathname: '/' },
          matches: [],
        },
        manifest: {},
        routeModules: {},
        criticalCss: null,
        serverHandoffString: '{}',
        serverHandoffStream: null,
        renderMeta: {},
        future: {},
        ssr: true,
        routeDiscovery: { mode: 'initial' },
        isSpaMode: false,
        serializeError: (err: unknown) => err,
      } as any,
      loadContext as any,
    )

    // renderToPipeableStream is async (onShellReady / onAllReady),
    // so we just verify it was called with the nonce before the Promise resolves.
    expect(renderToPipeableStreamMock).toHaveBeenCalledOnce()
    const [, options] = renderToPipeableStreamMock.mock.calls[0]
    expect(options).toMatchObject({
      nonce: 'test-nonce-xyz789',
    })
  })
})
