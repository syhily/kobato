import type { RouterClient } from '@orpc/server'

import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'

import type { ApiRouter } from '@/server/http/api-router'

const csrfStore = { token: null as string | null }

export function setCsrfToken(token: string) {
  csrfStore.token = token
}

/**
 * Typed oRPC client. Every procedure under `apiRouter` is available
 * as a strongly-typed async function. Errors are normalized as
 * `ORPCError` instances.
 */
const link = new RPCLink({
  // RPCLink does `new URL(baseUrl)` internally, which throws on relative
  // inputs ("Invalid URL"), so `/rpc` is resolved against `location.origin`
  // lazily: this module is import-transitively reachable from SSR typing code
  // and must not touch `window` at module load, and per-call reads keep
  // Storybook / Vitest `location` stubs honest.
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
