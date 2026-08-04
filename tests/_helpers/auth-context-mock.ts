import type { RequestContext } from '@kobato/server/http/request-context'

import { makeRequestContext } from '#/_helpers/request-context'
import { emptySession } from '#/_helpers/session'

import { vi } from 'vitest'

/**
 * Factory for `vi.mock('@kobato/server/http/request-context', ...)` that returns
 * the canonical `RequestContext` stored on the `RouterContextProvider`
 * passed via `makeRouteContext`. Falls back to an empty-session stub when
 * the context is not a proper `RouterContextProvider` (e.g. `new Map()`).
 */
export async function createRequestContextMockModule() {
  const actual = await vi.importActual<typeof import('@kobato/server/http/request-context')>(
    '@kobato/server/http/request-context',
  )
  return {
    ...actual,
    getRequestContext: vi.fn((args: { request: Request; context: unknown }): RequestContext => {
      try {
        const ctx = args.context as { get: (key: unknown) => unknown }
        return ctx.get(actual.requestContext) as RequestContext
      } catch {
        return makeRequestContext({ request: args.request, session: emptySession() })
      }
    }),
  }
}
