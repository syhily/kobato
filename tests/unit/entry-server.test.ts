import { beforeEach, describe, expect, it, vi } from 'vitest'

import { makeRequestContext } from '#/_helpers/request-context'
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

const { default: handleRequest } = await import('@/entry.server')

function routerContext(): unknown {
  return {
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
  } as never
}

describe('entry.server.tsx / handleRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it.each(['zh-CN', 'en-US', 'zh-TW', 'zh-HK'] as const)(
    'sets Content-Language to the request AppLocale (%s)',
    (locale) => {
      const responseHeaders = new Headers()
      const loadContext = {
        get: (context: unknown) =>
          context === requestContext
            ? makeRequestContext({ localization: { locale, timeZone: 'Asia/Shanghai' } })
            : undefined,
      }

      void handleRequest(
        new Request('http://localhost/'),
        200,
        responseHeaders,
        routerContext() as never,
        loadContext as never,
      )

      expect(responseHeaders.get('Content-Language')).toBe(locale)
    },
  )

  it('sets Content-Language on a HEAD response too', () => {
    const responseHeaders = new Headers()
    const loadContext = {
      get: (context: unknown) =>
        context === requestContext
          ? makeRequestContext({ localization: { locale: 'en-US', timeZone: 'UTC' } })
          : undefined,
    }

    const response = handleRequest(
      new Request('http://localhost/', { method: 'HEAD' }),
      200,
      responseHeaders,
      routerContext() as never,
      loadContext as never,
    )

    expect(responseHeaders.get('Content-Language')).toBe('en-US')
    expect(response).toBeInstanceOf(Response)
    expect((response as Response).headers.get('Content-Language')).toBe('en-US')
  })

  it('passes the nonce to ServerRouter and renderToPipeableStream', async () => {
    const loadContext = {
      get: vi.fn((context: unknown) => {
        if (context === requestContext) {
          return makeRequestContext({ cspNonce: 'test-nonce-xyz789' })
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
