import type { apiContract } from '@kobato/api/contract'
import type { ClientContext } from '@orpc/client'
import type { RPCLinkOptions } from '@orpc/client/fetch'
import type { ContractRouterClient } from '@orpc/contract'

import { createKobatoClient } from '@kobato/api/client/create-client'

type RpcLinkOptions = RPCLinkOptions<ClientContext>

export interface KobatoServerClientOptions {
  url: RpcLinkOptions['url']
  request: Request
  clientAddress?: string
  fetch?: RpcLinkOptions['fetch']
}

export interface KobatoServerClient {
  client: ContractRouterClient<typeof apiContract>
  responseHeaders: Headers
}

const FORWARDED_HEADER_NAMES = new Set([
  'cookie',
  'user-agent',
  'accept-language',
  'referer',
  'purpose',
  'sec-purpose',
  'traceparent',
  'tracestate',
  'sec-ch-ua',
])

const FORWARDED_HEADER_PREFIX = 'sec-ch-ua-'

function forwardedHeaders(request: Request, clientAddress: string | undefined): Record<string, string> {
  const headers: Record<string, string> = {}
  request.headers.forEach((value, name) => {
    if (FORWARDED_HEADER_NAMES.has(name) || name.startsWith(FORWARDED_HEADER_PREFIX)) {
      headers[name] = value
    }
  })
  if (clientAddress !== undefined) {
    headers['x-forwarded-for'] = clientAddress
  }
  return headers
}

function composeSignals(inbound: AbortSignal, perCall: AbortSignal | undefined): AbortSignal {
  return perCall === undefined ? inbound : AbortSignal.any([inbound, perCall])
}

export function createKobatoServerClient(options: KobatoServerClientOptions): KobatoServerClient {
  const responseHeaders = new Headers()
  const requestHeaders = forwardedHeaders(options.request, options.clientAddress)
  const client = createKobatoClient({
    url: options.url,
    fetch: async (request, init, fetchOptions, path, input) => {
      const initWithSignal = Object.assign({}, init, {
        signal: composeSignals(options.request.signal, fetchOptions.signal),
      })
      const response =
        options.fetch !== undefined
          ? await options.fetch(request, initWithSignal, fetchOptions, path, input)
          : await globalThis.fetch(request, initWithSignal)
      for (const cookie of response.headers.getSetCookie()) {
        responseHeaders.append('Set-Cookie', cookie)
      }
      return response
    },
    getHeaders: () => requestHeaders,
  })
  return { client, responseHeaders }
}
