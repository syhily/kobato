import { vi } from 'vitest'

import type { BlogSession } from '@/server/domains/auth/session-storage'

import { emptySession } from '#/_helpers/session'

export interface AuthContextMockOptions {
  /** Override getDbFromContext / getPoolFromContext with vi.fn(). */
  mockDbPool?: boolean
}

/**
 * Factory for `vi.mock('@/server/domains/auth/context', ...)` that extracts
 * session / request facts from the `RouterContextProvider` passed via
 * `makeRouteContext`. Falls back to an empty session when the context is
 * not a proper `RouterContextProvider` (e.g. `new Map()`).
 */
export async function createAuthContextMockModule(options?: AuthContextMockOptions) {
  const actual = await vi.importActual<typeof import('@/server/domains/auth/context')>('@/server/domains/auth/context')
  return {
    ...actual,
    getRouteRequestContext: vi.fn((args: { request: Request; context: unknown }) => {
      try {
        const ctx = args.context as { get: (key: unknown) => unknown }
        const sessionCtx = ctx.get(actual.sessionContext) as {
          session: BlogSession
          user: unknown
          role: unknown
        }
        const requestCtx = ctx.get(actual.requestContext) as { clientAddress: string; url: URL }
        return {
          session: sessionCtx.session,
          user: sessionCtx.user,
          role: sessionCtx.role,
          clientAddress: requestCtx.clientAddress,
          url: requestCtx.url,
        }
      } catch {
        return {
          session: emptySession(),
          user: undefined,
          role: null,
          clientAddress: '127.0.0.1',
          url: new URL(args.request.url),
        }
      }
    }),
    ...(options?.mockDbPool ? { getDbFromContext: vi.fn(), getPoolFromContext: vi.fn() } : {}),
  }
}
