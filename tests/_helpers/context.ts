import type { MakeRequestContextOptions } from '#/_helpers/request-context'
import { makeRequestContext } from '#/_helpers/request-context'

import { createInProcessTransport } from '@kobato/server/http/in-process-transport'
import { requestContext } from '@kobato/server/http/request-context'
import { RouterContextProvider } from 'react-router'

import { frontendContext } from '../../apps/public/src/lib/frontend-context'

// Stand-in for the `RouterContextProvider` that `buildLoadContext` populates
// in production. Direct loader/action unit tests that bypass the router get
// a context that already has the canonical `RequestContext` pre-loaded so
// the route handler's `getRequestContext(args)` keeps working — and, for
// the public app's loaders, the headless `FrontendRequestContext` with the
// in-process transport injected (the plan's "in-process transport survives
// as the test injection" form; production builds the HTTP fetch transport
// from `coreApiUrl` instead).
export type MakeContextOptions = MakeRequestContextOptions

export function makeRouteContext(options: MakeContextOptions = {}): RouterContextProvider {
  const context = new RouterContextProvider()
  const rc = makeRequestContext(options)
  context.set(requestContext, rc)
  context.set(frontendContext, {
    coreApiUrl: null,
    corePublicUrl: null,
    cspNonce: rc.cspNonce,
    transport: createInProcessTransport(rc),
  })
  return context
}

// Convenience to match the typical `loader({ request, context, params })`
// signature without callers having to construct the args object themselves.
export function makeLoaderArgs(
  options: MakeContextOptions & { params?: Record<string, string | undefined> } = {},
): any {
  const request = options.request ?? new Request('http://localhost/')
  const context = makeRouteContext({ ...options, request })
  return { request, context, params: options.params ?? {} }
}

/** React Router `data()` wraps the loader payload; unwrap for direct handler tests. */
export function unwrapLoaderData<T>(value: unknown): T {
  if (value !== null && typeof value === 'object' && 'data' in value) {
    return (value as { data: T }).data
  }
  return value as T
}
