import type { MakeRequestContextOptions } from '@kobato/test/request-context.ts'

import { requestContext } from '@kobato/server/http/request-context.ts'
import { makeRequestContext } from '@kobato/test/request-context.ts'
import { RouterContextProvider } from 'react-router'

export type MakeContextOptions = MakeRequestContextOptions

export function makeRouteContext(options: MakeContextOptions = {}): RouterContextProvider {
  const context = new RouterContextProvider()
  context.set(requestContext, makeRequestContext(options))
  return context
}

export function makeLoaderArgs(
  options: MakeContextOptions & { params?: Record<string, string | undefined> } = {},
): any {
  const request = options.request ?? new Request('http://localhost/')
  const context = makeRouteContext({ ...options, request })
  return { request, context, params: options.params ?? {} }
}

// Return-only T is the call-site typing API — `unwrapLoaderData<LoaderResult>(...)`.
// oxlint-disable-next-line typescript/no-unnecessary-type-parameters
export function unwrapLoaderData<T>(value: unknown): T {
  if (value !== null && typeof value === 'object' && 'data' in value) {
    return (value as { data: T }).data
  }
  return value as T
}
