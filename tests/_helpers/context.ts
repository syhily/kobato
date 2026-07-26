import { RouterContextProvider } from 'react-router'

import type { MakeRequestContextOptions } from '#/_helpers/request-context'

import { makeRequestContext } from '#/_helpers/request-context'
import { requestContext } from '@/server/http/request-context'

// Stand-in for the `RouterContextProvider` that `buildLoadContext` populates
// in production. Direct loader/action unit tests that bypass the router get
// a context that already has the canonical `RequestContext` pre-loaded so
// the route handler's `getRequestContext(args)` keeps working.
export type MakeContextOptions = MakeRequestContextOptions

export function makeRouteContext(options: MakeContextOptions = {}): RouterContextProvider {
  const context = new RouterContextProvider()
  context.set(requestContext, makeRequestContext(options))
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
