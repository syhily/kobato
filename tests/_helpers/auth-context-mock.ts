import { vi } from 'vitest'

import type { RequestContext } from '@/server/http/request-context'

import { makeRequestContext } from '#/_helpers/request-context'
import { emptySession } from '#/_helpers/session'

/** Factory for `vi.mock('@/server/http/request-context', ...)`: returns the
 *  canonical RequestContext; falls back to an empty-session stub otherwise. */
export async function createRequestContextMockModule() {
  const actual = await vi.importActual<typeof import('@/server/http/request-context')>('@/server/http/request-context')
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
