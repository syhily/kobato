// Both transport seams (RPCHandler's `clientInterceptors` for `/rpc/*`,
// createRouterClient's for `createSsrCaller`) receive the procedure `path`, so spans
// carry a stable name and never input.

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
