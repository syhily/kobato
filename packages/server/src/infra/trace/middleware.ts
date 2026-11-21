import type { Span } from '@kobato/server/infra/trace/facade'
import type { Context, MiddlewareHandler } from 'hono'

import { isTraceActive, runInSpan, startSpan } from '@kobato/server/infra/trace/facade'
import { addHttpServerActive, recordHttpServer } from '@kobato/server/infra/trace/metrics'
import { takeRoutePattern } from '@kobato/server/infra/trace/route-registry'
import { isSelfTelemetryPath } from '@kobato/server/infra/trace/self-telemetry-paths'
import { routePath } from 'hono/route'

const REACT_ROUTER_ROUTE = 'react_router'

function isCatchAllRoute(path: string): boolean {
  return path === '' || path === '*' || path === '/*' || path === '/'
}

function resolveRouteTemplate(c: Context): string {
  const reactRouterPattern = takeRoutePattern(c.req.raw)
  if (reactRouterPattern !== undefined) {
    return reactRouterPattern
  }
  const matched = routePath(c)
  return isCatchAllRoute(matched) ? REACT_ROUTER_ROUTE : matched
}

interface RequestOutcome {
  route: string
  status: number
}

function recordResponse(span: Span, c: Context): RequestOutcome {
  const status = c.res.status
  const route = resolveRouteTemplate(c)
  span.setAttributes({
    'http.request.method': c.req.method,
    'http.route': route,
    'http.response.status_code': status,
  })
  if (status >= 500) {
    span.setAttribute('error.category', `http_${status}`)
    span.setStatus('error')
  } else {
    span.setStatus('ok')
  }
  return { route, status }
}

function recordThrown(span: Span, c: Context, error: unknown): RequestOutcome {
  const route = resolveRouteTemplate(c)
  span.setAttributes({
    'http.request.method': c.req.method,
    'http.route': route,
  })
  if (error instanceof Response) {
    span.setAttribute('http.response.status_code', error.status)
    span.setStatus(error.status >= 500 ? 'error' : 'ok')
    if (error.status >= 500) {
      span.setAttribute('error.category', `http_${error.status}`)
    }
    return { route, status: error.status }
  }
  span.recordError(error)
  span.setStatus('error')
  return { route, status: 500 }
}

export function devTraceRequestMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    if (!isTraceActive()) {
      await next()
      return
    }
    if (isSelfTelemetryPath(c.req.path)) {
      await next()
      return
    }

    const startedAt = performance.now()
    addHttpServerActive(c.req.method, 1)
    const span = startSpan('http.server', {
      kind: 'server',
      traceContext: {
        traceparent: c.req.header('traceparent'),
        tracestate: c.req.header('tracestate'),
      },
    })

    return runInSpan(span, async () => {
      let outcome: RequestOutcome | null = null
      try {
        await next()
        outcome = recordResponse(span, c)
      } catch (error) {
        outcome = recordThrown(span, c, error)
        throw error
      } finally {
        span.end()
        addHttpServerActive(c.req.method, -1)
        if (outcome !== null) {
          recordHttpServer(c.req.method, outcome.route, outcome.status, performance.now() - startedAt)
        }
      }
    })
  }
}
