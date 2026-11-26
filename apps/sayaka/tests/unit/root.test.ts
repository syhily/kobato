import type { ContentBootstrapOutput } from '@kobato/api/contracts/public/content'
import type { SayakaRequestContext } from '@sayaka/server/request-context'

import { unsafeCast } from '@kobato/utils/unsafe-cast'
import { loader } from '@sayaka/root'
import { createSayakaRequestContext, sayakaRequestContext } from '@sayaka/server/request-context'
import { RouterContextProvider } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

vi.mock('virtual:kobato-route-warmup', () => ({ default: '' }))

type LoaderArgs = Parameters<typeof loader>[0]

function makeArgs(overrides: Partial<ContentBootstrapOutput>): { args: LoaderArgs; ctx: SayakaRequestContext } {
  const bootstrap = unsafeCast<ContentBootstrapOutput>({
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
  const client = { public: { content: { bootstrap: vi.fn(async () => bootstrap) } } }
  const ctx = createSayakaRequestContext({
    cspNonce: 'nonce-under-test',
    client: unsafeCast<SayakaRequestContext['client']>(client),
    responseHeaders: new Headers(),
    analyticsEventId: 'event-id',
    takeResourceStream: () => null,
  })
  const provider = new RouterContextProvider()
  provider.set(sayakaRequestContext, ctx)
  const args = unsafeCast<LoaderArgs>({
    request: new Request('http://localhost/'),
    context: provider,
    params: {},
  })
  return { args, ctx }
}

describe('root loader', () => {
  it('redirects to /admin/setup with 303 while the instance has no admin', async () => {
    const { args } = makeArgs({ installState: 'noAdmin' })
    const error = await loader(args).catch((thrown: unknown) => thrown)
    expect(error).toBeInstanceOf(Response)
    const response = unsafeCast<Response>(error)
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('/admin/setup')
  })

  it('stores the bootstrap blog settings in the per-request context for the CSP step', async () => {
    const blogSettings = unsafeCast<ContentBootstrapOutput['blogSettings']>({ siteIdentity: { title: 'x' } })
    const { args, ctx } = makeArgs({ blogSettings })
    const result = await loader(args)
    expect(ctx.bundle).toBe(blogSettings)
    expect(result).toMatchObject({
      blogSettings,
      cspNonce: 'nonce-under-test',
      csrfToken: 'csrf-token',
      installState: 'installed',
    })
  })
})
