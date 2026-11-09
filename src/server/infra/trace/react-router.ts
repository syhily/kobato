// React Router root middleware span (ADR-0012).
//
// One span per document or `.data` request. React Router's `next()` returns
// error responses instead of throwing, so the status comes from the response;
// a thrown Response stays control flow and a real error is projected to a
// name + stable category by the facade.

import type { MiddlewareFunction } from 'react-router'

import type { Span } from '@/server/infra/trace/facade'

import { isTraceActive, runInSpan, startSpan } from '@/server/infra/trace/facade'
import { recordRoutePattern } from '@/server/infra/trace/route-registry'

const REACT_ROUTER_ROUTE = 'react_router'

function requestKind(request: Request): 'data' | 'document' {
  try {
    return new URL(request.url).pathname.endsWith('.data') ? 'data' : 'document'
  } catch {
    return 'document'
  }
}

function routeTemplate(pattern: string | undefined): string {
  if (pattern === undefined || pattern.length === 0 || pattern === '*' || pattern === '/*') {
    return REACT_ROUTER_ROUTE
  }
  return pattern
}

function recordResponse(span: Span, response: Response): void {
  span.setAttribute('http.response.status_code', response.status)
  if (response.status >= 500) {
    span.setAttribute('error.category', `http_${response.status}`)
    span.setStatus('error')
  } else {
    span.setStatus('ok')
  }
}

export const traceRouteMiddleware: MiddlewareFunction<Response> = (args, next) => {
  if (!isTraceActive()) {
    return next()
  }

  const pattern = routeTemplate(args.pattern)
  recordRoutePattern(args.request, pattern)

  const kind = requestKind(args.request)
  const span = startSpan(`rr.${kind}`, {
    attributes: {
      'http.request.method': args.request.method,
      'rr.request.kind': kind,
      'rr.route': pattern,
    },
  })

  return runInSpan(span, async () => {
    try {
      const response = await next()
      recordResponse(span, response)
      return response
    } catch (error) {
      if (error instanceof Response) {
        recordResponse(span, error)
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
