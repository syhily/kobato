import type { apiContract } from '@kobato/api/contract'
import type { publicContract } from '@kobato/api/public-contract'
import type { ClientContext } from '@orpc/client'
import type { RPCLinkOptions } from '@orpc/client/fetch'
import type { ContractRouterClient } from '@orpc/contract'

import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'

type RpcLinkOptions = RPCLinkOptions<ClientContext>

export interface KobatoClientOptions {
  /**
   * The FULL RPC URL (`https://host/rpc`), never the site origin. A function is forwarded to the RPC link's dynamic
   * URL support and re-evaluated per request.
   */
  url: RpcLinkOptions['url']
  /** Custom fetch for the RPC link; defaults to delegating `globalThis.fetch(request, init)` at call time. */
  fetch?: RpcLinkOptions['fetch']
  /** Maps onto the RPC link's `headers` option — a plain value, promise, or per-call function. */
  getHeaders?: RpcLinkOptions['headers']
}

export function createKobatoClient(options: KobatoClientOptions): ContractRouterClient<typeof apiContract> {
  const link = new RPCLink({
    fetch: options.fetch ?? ((request, init) => globalThis.fetch(request, init)),
    headers: options.getHeaders,
    url: options.url,
  })
  return createORPCClient(link)
}

/**
 * The headless public seam: the same transport as `createKobatoClient`, narrowed to the `public` group so external
 * consumers get `client.content.*` / `client.comments.*` against the canonical `/rpc/public/*` paths — with no
 * `account`/`admin` surface reachable from the returned client.
 */
export function createKobatoPublicClient(options: KobatoClientOptions): ContractRouterClient<typeof publicContract> {
  return createKobatoClient(options).public
}
