// oRPC-over-HTTP caller for tests/e2e. Same wire format as the in-process
// tests/_helpers/rpc-call.ts (POST /rpc<path>, body {json: input},
// response {json: ...}) but against the live server, with the CSRF token
// the /rpc/* csrfGuard requires.
//
// `path` is the STRUCTURAL router path in camelCase (the client-side
// convention: `orpc.admin.posts.upsertMeta` → '/admin/posts/upsertMeta').
// The kebab-case paths in `.route({ path: ... })` are OpenAPI metadata —
// the RPCHandler matches router keys, not those strings.

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
