// oRPC transport instrumentation (ADR-0012).
//
// Both existing transport seams use oRPC's official client interceptor:
// `RPCHandler`'s `clientInterceptors` for the network `/rpc/*` bridge and
// `createRouterClient`'s `interceptors` for `createSsrCaller`. The interceptor
// receives the router-procedure `path`, so spans carry a stable procedure name
// and never any procedure input.

import type { Span } from '@/server/infra/trace/facade'

import { isTraceActive, runInSpan, startSpan } from '@/server/infra/trace/facade'

export type OrpcTraceTransport = 'http' | 'in_process'

export interface OrpcTraceInterceptorOptions<TOutput> {
  path: readonly string[]
  next(): Promise<TOutput>
}

function procedureName(path: readonly string[]): string {
  const joined = path.join('.')
  return joined.length === 0 ? 'unknown' : joined
}

/**
 * Build the interceptor for one transport. The generic return type lets the
 * function satisfy oRPC's own `Interceptor` shape without importing
 * `@orpc/shared` (a transitive, version-pinned package).
 */
export function createOrpcTraceInterceptor(
  transport: OrpcTraceTransport,
): <TOutput>(options: OrpcTraceInterceptorOptions<TOutput>) => Promise<TOutput> {
  return async function traceOrpcInterceptor<TOutput>(options: OrpcTraceInterceptorOptions<TOutput>): Promise<TOutput> {
    if (!isTraceActive()) {
      return options.next()
    }

    const procedure = procedureName(options.path)
    const span: Span = startSpan(`orpc.${procedure}`, {
      attributes: {
        'orpc.procedure': procedure,
        'orpc.transport': transport,
      },
    })

    return runInSpan(span, async () => {
      try {
        const output = await options.next()
        span.setStatus('ok')
        return output
      } catch (error) {
        if (error instanceof Response) {
          span.setAttribute('http.response.status_code', error.status)
          span.setStatus(error.status >= 500 ? 'error' : 'ok')
        } else {
          span.recordError(error)
          span.setStatus('error')
        }
        throw error
      } finally {
        span.end()
      }
    })
  }
}
