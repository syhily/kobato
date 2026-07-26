import { vi } from 'vitest'

import type { RequestContext } from '@/server/http/request-context'

import { emptySession } from '#/_helpers/session'
import { extractRequestFacts, normalizeDocumentUrl } from '@/server/http/utils/request-facts'

/**
 * Factory for `vi.mock('@/server/http/request-context', ...)` that returns
 * the canonical `RequestContext` stored on the `RouterContextProvider`
 * passed via `makeRouteContext`. Falls back to an empty-session stub when
 * the context is not a proper `RouterContextProvider` (e.g. `new Map()`).
 */
export async function createRequestContextMockModule() {
  const actual = await vi.importActual<typeof import('@/server/http/request-context')>('@/server/http/request-context')
  return {
    ...actual,
    getRequestContext: vi.fn((args: { request: Request; context: unknown }): RequestContext => {
      try {
        const ctx = args.context as { get: (key: unknown) => unknown }
        return ctx.get(actual.requestContext) as RequestContext
      } catch {
        return {
          session: emptySession(),
          viewer: null,
          clientAddress: '127.0.0.1',
          url: normalizeDocumentUrl(new URL(args.request.url)),
          requestFacts: extractRequestFacts(args.request),
          db: {} as RequestContext['db'],
          pool: {} as RequestContext['pool'],
          cspNonce: 'test-csp-nonce',
          markSessionDirty: () => {},
        }
      }
    }),
  }
}
