// @vitest-environment node
import type { ContentBootstrapOutput } from '@kobato/api/contracts/public/content'
import type { ListingPageLoaderData } from '@kobato/catalog/listing'
import type { SayakaRequestContext } from '@sayaka/server/request-context'

import { unsafeCast } from '@kobato/base/utils/unsafe-cast'
import { loader as rootLoader } from '@sayaka/root'
import { loader as homeLoader } from '@sayaka/routes/home'
import { createSayakaRequestContext, sayakaRequestContext } from '@sayaka/server/request-context'
import { RouterContextProvider } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

function makeBootstrap(overrides: Partial<ContentBootstrapOutput> = {}): ContentBootstrapOutput {
  return unsafeCast<ContentBootstrapOutput>({
    admin: false,
    currentUser: null,
    blogSettings: null,
    fonts: null,
    theme: null,
    csrfToken: 'csrf-token',
    installState: 'installed',
    i18n: { locale: 'zh-CN', revision: 'rev', messages: {} },
    rum: null,
    ...overrides,
  })
}

function makeContext(client: unknown): { ctx: SayakaRequestContext; provider: RouterContextProvider } {
  const ctx = createSayakaRequestContext({
    cspNonce: 'nonce',
    client: unsafeCast<SayakaRequestContext['client']>(client),
    responseHeaders: new Headers(),
    analyticsEventId: 'event-id',
    takeResourceStream: () => null,
  })
  const provider = new RouterContextProvider()
  provider.set(sayakaRequestContext, ctx)
  return { ctx, provider }
}

function rootArgs(provider: RouterContextProvider): Parameters<typeof rootLoader>[0] {
  return unsafeCast<Parameters<typeof rootLoader>[0]>({
    request: new Request('http://localhost/'),
    context: provider,
    params: {},
  })
}

function homeArgs(provider: RouterContextProvider): Parameters<typeof homeLoader>[0] {
  return unsafeCast<Parameters<typeof homeLoader>[0]>({
    request: new Request('http://localhost/'),
    context: provider,
    params: {},
  })
}

describe('the memoized per-request bootstrap promise', () => {
  it('drives exactly one bootstrap call per document request when the root and leaf loaders run together', async () => {
    const bootstrap = vi.fn(async () => makeBootstrap())
    const home = vi.fn(async () => ({
      kind: 'ok',
      etag: 'W/"home"',
      listing: unsafeCast<ListingPageLoaderData>({ pageNum: 1 }),
    }))
    const { provider } = makeContext({ public: { content: { bootstrap, home } } })

    await Promise.all([rootLoader(rootArgs(provider)), homeLoader(homeArgs(provider))])

    expect(bootstrap).toHaveBeenCalledTimes(1)
  })

  it('answers a 304 with the resolved site locale when the leaf loader resolves first', async () => {
    const bootstrap = vi.fn(async () => makeBootstrap())
    const home = vi.fn(async () => ({ kind: 'not-modified', etag: 'W/"home"' }))
    const { provider } = makeContext({ public: { content: { bootstrap, home } } })

    const thrown = await homeLoader(homeArgs(provider)).catch((error: unknown) => error)

    expect(thrown).toBeInstanceOf(Response)
    const response = unsafeCast<Response>(thrown)
    expect(response.status).toBe(304)
    expect(response.headers.get('content-language')).toBe('zh-CN')
  })

  it('rejects both loaders with the same error when the bootstrap fails', async () => {
    const failure = new Error('kobato unreachable')
    const bootstrap = vi.fn(async () => {
      throw failure
    })
    const home = vi.fn(async () => ({ kind: 'ok', etag: 'W/"home"', listing: {} }))
    const { provider } = makeContext({ public: { content: { bootstrap, home } } })

    const rootError = await rootLoader(rootArgs(provider)).catch((error: unknown) => error)
    const homeError = await homeLoader(homeArgs(provider)).catch((error: unknown) => error)

    expect(rootError).toBe(failure)
    expect(homeError).toBe(failure)
    expect(bootstrap).toHaveBeenCalledTimes(1)
  })
})
