import type { RequestContext } from '@kobato/server/http/request-context.ts'

import { vi } from 'vitest'

import { makeRequestContext } from './request-context'
import { emptySession } from './session'

/** Factory for `vi.mock('@kobato/server/http/request-context.ts', ...)`: returns the
 *  canonical RequestContext; falls back to an empty-session stub otherwise. */
export async function createRequestContextMockModule() {
  const actual = await vi.importActual<typeof import('@kobato/server/http/request-context.ts')>(
    '@kobato/server/http/request-context.ts',
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
