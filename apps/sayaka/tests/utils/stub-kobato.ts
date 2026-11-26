import type { KobatoServerClient } from '@kobato/api/client/create-server-client'
import type { ContentBootstrapOutput } from '@kobato/api/contracts/public/content'
import type { SayakaRequestContext } from '@sayaka/server/request-context'

import { createKobatoServerClient } from '@kobato/api/client/create-server-client'
import { unsafeCast } from '@kobato/utils/unsafe-cast'
import { os } from '@orpc/server'
import { RPCHandler } from '@orpc/server/fetch'
import { createSayakaRequestContext, sayakaRequestContext } from '@sayaka/server/request-context'
import { RouterContextProvider } from 'react-router'

export interface StubCall {
  path: string
  input: Record<string, unknown>
}

type StubHandler = (input: Record<string, unknown>) => unknown

export const STUB_ANALYTICS_EVENT_ID = '11111111-2222-4333-8444-555555555555'

export const STUB_BOOTSTRAP = unsafeCast<ContentBootstrapOutput>({
  admin: false,
  currentUser: null,
  blogSettings: null,
  fonts: null,
  theme: null,
  csrfToken: 'csrf-token',
  installState: 'installed',
  i18n: { locale: 'zh-CN', revision: 'rev', messages: {} },
  rum: null,
})

export interface StubKobato {
  client: KobatoServerClient['client']
  takeResourceStream: KobatoServerClient['takeResourceStream']
  calls: StubCall[]
}

export function createStubKobato(handlers: Record<string, StubHandler>): StubKobato {
  const calls: StubCall[] = []
  const root: Record<string, unknown> = {}
  const routes: Record<string, StubHandler> = {
    'public.content.bootstrap': () => STUB_BOOTSTRAP,
    ...handlers,
  }
  for (const [path, handle] of Object.entries(routes)) {
    const segments = path.split('.')
    let node = root
    for (const segment of segments.slice(0, -1)) {
      const next = node[segment] ?? {}
      node[segment] = next
      node = unsafeCast<Record<string, unknown>>(next)
    }
    node[segments[segments.length - 1]!] = os.handler(({ input }) => {
      calls.push({ path, input: unsafeCast<Record<string, unknown>>(input) })
      return handle(unsafeCast<Record<string, unknown>>(input))
    })
  }
  const rpcHandler = new RPCHandler(unsafeCast<never>(root))
  const { client, takeResourceStream } = createKobatoServerClient({
    url: 'http://kobato.test/rpc',
    request: new Request('http://sayaka.test/'),
    fetch: async (request) => {
      const result = await rpcHandler.handle(request, { prefix: '/rpc' })
      return result.response ?? new Response('no matching stub procedure', { status: 404 })
    },
  })
  return { client, takeResourceStream, calls }
}

export function makeSayakaLoaderArgs(input: { stub: StubKobato; request: Request; params: Record<string, string> }): {
  args: unknown
  ctx: SayakaRequestContext
} {
  const ctx = createSayakaRequestContext({
    cspNonce: 'nonce-under-test',
    client: input.stub.client,
    responseHeaders: new Headers(),
    takeResourceStream: input.stub.takeResourceStream,
    analyticsEventId: STUB_ANALYTICS_EVENT_ID,
  })
  const provider = new RouterContextProvider()
  provider.set(sayakaRequestContext, ctx)
  return {
    ctx,
    args: unsafeCast<unknown>({ request: input.request, context: provider, params: input.params }),
  }
}

export interface StubRelayRequest {
  url: string
  forwardedFor: string | null
}

export interface InstalledStubKobatoFetch {
  calls: StubCall[]
  requests: StubRelayRequest[]
  restore(): void
}

export function installStubKobatoFetch(handlers: Record<string, StubHandler>): InstalledStubKobatoFetch {
  const calls: StubCall[] = []
  const requests: StubRelayRequest[] = []
  const root: Record<string, unknown> = {}
  const routes: Record<string, StubHandler> = {
    'public.content.bootstrap': () => STUB_BOOTSTRAP,
    ...handlers,
  }
  for (const [path, handle] of Object.entries(routes)) {
    const segments = path.split('.')
    let node = root
    for (const segment of segments.slice(0, -1)) {
      const next = node[segment] ?? {}
      node[segment] = next
      node = unsafeCast<Record<string, unknown>>(next)
    }
    node[segments[segments.length - 1]!] = os.handler(({ input }) => {
      calls.push({ path, input: unsafeCast<Record<string, unknown>>(input) })
      return handle(unsafeCast<Record<string, unknown>>(input))
    })
  }
  const rpcHandler = new RPCHandler(unsafeCast<never>(root))
  const stubFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? input : new Request(input, init)
    requests.push({
      url: request.url,
      forwardedFor: request.headers.get('x-forwarded-for'),
    })
    const result = await rpcHandler.handle(request, { prefix: '/rpc' })
    return result.response ?? new Response('no matching stub procedure', { status: 404 })
  }
  const previous = globalThis.fetch
  globalThis.fetch = stubFetch as typeof globalThis.fetch
  return {
    calls,
    requests,
    restore() {
      globalThis.fetch = previous
    },
  }
}

// oxlint-disable-next-line typescript/no-unnecessary-type-parameters
export function loaderData<T>(result: unknown): T {
  return unsafeCast<{ data: T }>(result).data
}

export function loaderHeaders(result: unknown): Record<string, string> {
  return unsafeCast<{ init?: { headers?: Record<string, string> } }>(result).init?.headers ?? {}
}

export function stubCallsFor(stub: StubKobato, path: string): StubCall[] {
  return stub.calls.filter((call) => call.path === path)
}
