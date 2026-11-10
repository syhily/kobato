// Hono request-lifecycle span.
//
// Mounted after trust-proxy/request-ID and before compression, so the span
// covers the complete application pipeline. Only W3C trace context is
// extracted; the route template is resolved after the downstream handler has
// run, and unknown/catch-all routes collapse to a fixed category so a raw
// path can never become an attribute.

import type { Context, MiddlewareHandler } from 'hono'

import { routePath } from 'hono/route'

import type { Span } from '@/server/infra/trace/facade'

import { isTraceActive, runInSpan, startSpan } from '@/server/infra/trace/facade'
import { addHttpServerActive, recordHttpServer } from '@/server/infra/trace/metrics'
import { takeRoutePattern } from '@/server/infra/trace/route-registry'
import { isSelfTelemetryPath } from '@/server/infra/trace/self-telemetry-paths'

/** Hono's catch-all route for React Router documents/data requests. */
const REACT_ROUTER_ROUTE = 'react_router'

function isCatchAllRoute(path: string): boolean {
  return path === '' || path === '*' || path === '/*' || path === '/'
}

function resolveRouteTemplate(c: Context): string {
  // Prefer the pattern React Router matched (handed over through the shared
  // Request object); otherwise use Hono's CURRENT route index — the handler
  // that produced the response — not the last registered match.
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
    // A thrown Response is control flow, not a fault.
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
