import type { RequestContext } from '@kobato/server/http/request-context'
import type { MakeRequestContextOptions } from '@kobato/server/tests/utils/request-context'

import { stubRouteRequestContext } from '@tests/utils/orpc-client-mock'

export function makeRouteContext(options: MakeRequestContextOptions = {}): RequestContext {
  return stubRouteRequestContext(options)
}

// oxlint-disable-next-line typescript/no-unnecessary-type-parameters
export function unwrapLoaderData<T>(value: unknown): T {
  if (value !== null && typeof value === 'object' && 'data' in value) {
    return (value as { data: T }).data
  }
  return value as T
}
