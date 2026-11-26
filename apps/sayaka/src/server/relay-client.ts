import type { KobatoServerClient } from '@kobato/api/client/create-server-client'
import type { Env } from '@sayaka/server/hono-env'
import type { Context } from 'hono'

import { createKobatoServerClient } from '@kobato/api/client/create-server-client'
import { sayakaConfig } from '@sayaka/server/config'
import { getDirectRemoteAddress, visitorAddress } from '@sayaka/server/visitor-address'

export function createRelayClient(c: Context<Env>): KobatoServerClient['client'] {
  const clientAddress = visitorAddress(c.req.raw, getDirectRemoteAddress(c), sayakaConfig.trustedProxies)
  return createKobatoServerClient({
    url: sayakaConfig.kobatoRpcUrl,
    request: c.req.raw,
    clientAddress,
  }).client
}
