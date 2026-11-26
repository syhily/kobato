import type { apiContract } from '@kobato/api/contract'
import type { ClientContext } from '@orpc/client'
import type { RPCLinkOptions } from '@orpc/client/fetch'
import type { ContractRouterClient } from '@orpc/contract'

import { ANALYTICS_EVENT_HEADER } from '@kobato/api/client/analytics-event'
import { createKobatoClient } from '@kobato/api/client/create-client'
import {
  boundedUpstreamSignal,
  DEFAULT_REQUEST_TIMEOUT_MS,
  requestTimeoutMsForProcedure,
} from '@kobato/api/client/request-timeout'
import {
  type KobatoResourceStream,
  RESOURCE_STREAM_HEADER,
  resourceStreamKey,
} from '@kobato/api/client/resource-stream'

type RpcLinkOptions = RPCLinkOptions<ClientContext>

export interface KobatoServerClientOptions {
  url: RpcLinkOptions['url']
  request: Request
  clientAddress?: string
  analyticsEventId?: string
  requestTimeoutMs?: number
  fetch?: RpcLinkOptions['fetch']
}

export interface KobatoServerClient {
  client: ContractRouterClient<typeof apiContract>
  responseHeaders: Headers
  takeResourceStream: (procedure: string) => KobatoResourceStream | null
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

const CAPTURED_HEADER_DENYLIST = new Set(['set-cookie', 'content-encoding', 'content-length', RESOURCE_STREAM_HEADER])

function forwardedHeaders(
  request: Request,
  clientAddress: string | undefined,
  analyticsEventId: string | undefined,
): Record<string, string> {
  const headers: Record<string, string> = {}
  request.headers.forEach((value, name) => {
    if (FORWARDED_HEADER_NAMES.has(name) || name.startsWith(FORWARDED_HEADER_PREFIX)) {
      headers[name] = value
    }
  })
  if (clientAddress !== undefined) {
    headers['x-forwarded-for'] = clientAddress
  }
  if (analyticsEventId !== undefined) {
    headers[ANALYTICS_EVENT_HEADER] = analyticsEventId
  }
  return headers
}

function composeSignals(inbound: AbortSignal, perCall: AbortSignal | undefined): AbortSignal {
  return perCall === undefined ? inbound : AbortSignal.any([inbound, perCall])
}

function capturedStreamHeaders(response: Headers): Headers {
  const headers = new Headers()
  response.forEach((value, name) => {
    if (!CAPTURED_HEADER_DENYLIST.has(name.toLowerCase())) {
      headers.append(name, value)
    }
  })
  return headers
}

export function createKobatoServerClient(options: KobatoServerClientOptions): KobatoServerClient {
  const responseHeaders = new Headers()
  const resourceStreams = new Map<string, KobatoResourceStream>()
  const requestHeaders = forwardedHeaders(options.request, options.clientAddress, options.analyticsEventId)
  const client = createKobatoClient({
    url: options.url,
    fetch: async (request, init, fetchOptions, path, input) => {
      const bounded = boundedUpstreamSignal(
        composeSignals(options.request.signal, fetchOptions.signal),
        requestTimeoutMsForProcedure(path, options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS),
      )
      const initWithSignal = Object.assign({}, init, {
        signal: bounded.signal,
      })
      let response: Response
      try {
        response =
          options.fetch !== undefined
            ? await options.fetch(request, initWithSignal, fetchOptions, path, input)
            : await globalThis.fetch(request, initWithSignal)
      } finally {
        bounded.release()
      }
      for (const cookie of response.headers.getSetCookie()) {
        responseHeaders.append('Set-Cookie', cookie)
      }
      if (response.headers.has(RESOURCE_STREAM_HEADER)) {
        const key = resourceStreamKey(path)
        const previous = resourceStreams.get(key)
        if (previous !== undefined) {
          void previous.body.cancel()
        }
        const declared = Number.parseInt(response.headers.get(RESOURCE_STREAM_HEADER) ?? '', 10)
        resourceStreams.set(key, {
          status: Number.isInteger(declared) && declared >= 200 && declared <= 599 ? declared : response.status,
          headers: capturedStreamHeaders(response.headers),
          body: response.body ?? new ReadableStream<Uint8Array>({ start: (controller) => controller.close() }),
        })
        return new Response(null, { status: 200, headers: { 'content-type': 'application/json' } })
      }
      return response
    },
    getHeaders: () => requestHeaders,
  })
  return {
    client,
    responseHeaders,
    takeResourceStream: (procedure) => {
      const captured = resourceStreams.get(procedure)
      if (captured === undefined) {
        return null
      }
      resourceStreams.delete(procedure)
      return captured
    },
  }
}
