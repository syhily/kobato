import type { RouterClient } from '@orpc/server'

import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'

import type { ApiRouter } from '@/server/http/api-router'

const csrfStore = { token: null as string | null }

export function setCsrfToken(token: string) {
  csrfStore.token = token
}

/**
 * Typed oRPC client: every `apiRouter` procedure is a strongly-typed async
 * function; errors normalize as `ORPCError`.
 *
 * Error copy is folded SERVER-side: a domain error's localized issue summary is
 * already part of `ORPCError.message` (and the structured descriptor rides
 * `data`). The client therefore installs no rejection interceptor — re-appending
 * issues here would duplicate the text and drop the request locale.
 */
const link = new RPCLink({
  // RPCLink's `new URL(baseUrl)` throws on relative inputs, so resolve `/rpc`
  // against `location.origin` lazily per call — never at module load.
  url: () => `${globalThis.location?.origin ?? 'http://localhost'}/rpc`,
  headers: () => {
    const h: Record<string, string> = {}
    if (csrfStore.token) {
      h['X-CSRF-Token'] = csrfStore.token
    }
    return h
  },
})

export const orpc: RouterClient<ApiRouter> = createORPCClient(link)
