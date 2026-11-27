import type { E2eClient } from '@kobato/test/instance/client/http'

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
  const parsed: unknown = await res.json()
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`e2e rpc ${path}: response is not an oRPC envelope`)
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return { status: res.status, json: ('json' in parsed ? parsed.json : undefined) as T }
}
