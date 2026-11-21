import type { RequestContext } from '@kobato/server/http/request-context.ts'

import { makeRequestContext } from '@kobato/server/tests/utils/request-context.ts'
import { emptySession } from '@kobato/server/tests/utils/session.ts'
import { vi } from 'vitest'

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
