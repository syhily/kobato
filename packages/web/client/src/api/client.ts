import type { apiContract } from '@kobato/api/contract.ts'
import type { ContractRouterClient } from '@orpc/contract'

import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'

const csrfStore = { token: null as string | null }

export function setCsrfToken(token: string) {
  csrfStore.token = token
}

const link = new RPCLink({
  // Read the global per call so test transports installed later are honoured.
  fetch: (request, init) => globalThis.fetch(request, init),
  url: () => `${globalThis.location?.origin ?? 'http://localhost'}/rpc`,
  headers: () => {
    const h: Record<string, string> = {}
    if (csrfStore.token) {
      h['X-CSRF-Token'] = csrfStore.token
    }
    return h
  },
})

export const orpc: ContractRouterClient<typeof apiContract> = createORPCClient(link)
