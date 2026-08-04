import type { ContractRouterClient } from '@orpc/contract'

import { contentPublicContractRouter } from '@kobato/sdk/contracts'
import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'

/**
 * The official SDK entry: the typed Content API client with an
 * injectable transport (the formal successor of the phase-0.5
 * `client/api/public-client`).
 *
 *  - official frontend: HTTP transport pointed at core `/rpc`
 *  - tests: in-process transport
 *  - third-party TypeScript consumers: HTTP transport, same client
 *
 * The transport injects `RequestContext` fidelity (UA/IP/session) in
 * the in-process form; the HTTP form carries real headers.
 *
 * The client type is derived from the SDK's own contract router
 * (`contracts.ts`) — the self-contained, published type surface. Zero
 * workspace dependencies: the router type and every DTO it references
 * live in this package.
 */

export type PublicTransport = (request: Request) => Promise<Response>

/** The typed client surface for the Content API. */
export type PublicContentClient = ContractRouterClient<typeof contentPublicContractRouter>

export function createPublicClient(transport: PublicTransport): PublicContentClient {
  const link = new RPCLink({
    url: () => 'http://localhost/rpc',
    fetch: (request) => transport(request),
  })
  return createORPCClient(link)
}
