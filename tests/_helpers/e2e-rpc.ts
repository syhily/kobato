// oRPC-over-HTTP caller for tests/e2e — same wire format as rpc-call.ts,
// live server + the CSRF token /rpc/* requires. `path` is the camelCase
// structural router path; kebab-case `.route()` strings are OpenAPI metadata.

import type { E2eClient } from './e2e-client'

export interface E2eRpcResult<T> {
  status: number
  json: T
}

export async function callE2eRpc<T>(
  client: E2eClient,
  path: string,
  input: unknown,
  csrfToken: string,
): Promise<E2eRpcResult<T>> {
  const res = await client.postJson(`/rpc${path}`, { json: input }, { 'x-csrf-token': csrfToken })
  const body = (await res.json()) as { json: T }
  return { status: res.status, json: body.json }
}
