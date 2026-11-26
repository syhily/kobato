import type { RequestContext } from '@kobato/server/http/request-context'
import type { MakeRequestContextOptions } from '@kobato/server/tests/utils/request-context'

import { apiRouter } from '@kobato/server/http/api-router'
import { type HandlerContext, orpcInputValidationInterceptor } from '@kobato/server/http/orpc-base'
import { makeRequestContext } from '@kobato/server/tests/utils/request-context'
import { createRouterClient } from '@orpc/server'
import { vi } from 'vitest'

interface OrpcStubState {
  context: HandlerContext | null
}

const state: OrpcStubState = { context: null }

type AnyRecord = Record<string, unknown>

interface StubCall {
  (...args: unknown[]): unknown
  path: string[]
}

function makeStubNode(path: string[]): StubCall {
  const call = ((args?: unknown) => {
    const context = state.context
    if (context === null) {
      throw new Error('orpc stub context is not set — call stubRouteRequestContext() first')
    }
    let node: unknown = createRouterClient(apiRouter, {
      context,
      interceptors: [orpcInputValidationInterceptor],
    })
    for (const key of path) {
      node = (node as AnyRecord)[key]
    }
    return (node as (args?: unknown) => unknown)(args)
  }) as StubCall
  call.path = path
  return new Proxy(call, {
    get(_target, prop) {
      if (typeof prop !== 'string') {
        return undefined
      }
      return makeStubNode([...path, prop])
    },
  })
}

const stubOrpc = makeStubNode([])

export function stubRouteRequestContext(options: MakeRequestContextOptions = {}): RequestContext {
  const requestContext = makeRequestContext(options)
  state.context = {
    request: options.request ?? new Request('http://localhost/'),
    requestFacts: requestContext.requestFacts,
    session: requestContext.session,
    viewer: requestContext.viewer,
    clientAddress: requestContext.clientAddress,
    responseHeaders: new Headers(),
    markSessionDirty: requestContext.markSessionDirty,
    db: requestContext.db,
    settings: requestContext.settings,
    localization: requestContext.localization,
  }
  return requestContext
}

export function orpcStubCookies(): string[] {
  return state.context?.responseHeaders.getSetCookie() ?? []
}

export function createOrpcClientMockModule() {
  return {
    orpc: stubOrpc,
    setCsrfToken: vi.fn(),
  }
}
