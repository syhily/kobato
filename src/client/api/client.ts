import type { RouterClient } from '@orpc/server'

import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'

import type { ApiRouter } from '@/server/http/api-router'

const csrfStore = { token: null as string | null }

export function setCsrfToken(token: string) {
  csrfStore.token = token
}

// Server folds error copy into ORPCError.message; a rejection interceptor
// here would duplicate the text and drop the request locale.
const link = new RPCLink({
  // RPCLink's new URL() throws on relative inputs; resolve /rpc against
  // location.origin lazily per call, never at module load.
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
