import type { ServerOptions } from 'node:http'

export const HTTP_SERVER_OPTIONS = Object.freeze({
  headersTimeout: 20_000,
  requestTimeout: 0,
  connectionsCheckingInterval: 10_000,
} satisfies ServerOptions)
