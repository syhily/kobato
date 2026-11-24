import type { apiContract } from '@kobato/api/contract'
import type { publicContract } from '@kobato/api/public-contract'
import type { ClientContext } from '@orpc/client'
import type { RPCLinkOptions } from '@orpc/client/fetch'
import type { ContractRouterClient } from '@orpc/contract'

import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'

type RpcLinkOptions = RPCLinkOptions<ClientContext>

export interface KobatoClientOptions {
  url: RpcLinkOptions['url']
  fetch?: RpcLinkOptions['fetch']
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

export function createKobatoPublicClient(options: KobatoClientOptions): ContractRouterClient<typeof publicContract> {
  return createKobatoClient(options).public
}
