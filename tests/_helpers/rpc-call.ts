import { RPCHandler } from '@orpc/server/fetch'

import type { HandlerContext } from '@/server/http/orpc-base'

import { apiRouter } from '@/server/http/api-router'

const handler = new RPCHandler(apiRouter)

export async function callRpc(path: string, input: unknown, context: HandlerContext): Promise<Response> {
  const req = new Request(`http://localhost/rpc${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ json: input }),
  })
  const result = await handler.handle(req, { prefix: '/rpc', context })
  if (!result.matched) {
    throw new Error(`No route matched for ${path}`)
  }
  return result.response
}

export async function parseRpcJson<T>(response: Response): Promise<T> {
  const body = (await response.json()) as { json: T }
  return body.json
}
