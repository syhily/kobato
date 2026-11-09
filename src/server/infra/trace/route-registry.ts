// Request-scoped route-template handoff between the React Router middleware
// and the Hono span (ADR-0012).
//
// The Hono catch-all cannot know which React Router route matched, and the
// matched pattern only exists inside React Router's middleware. The Request
// object is shared across both layers, so a WeakMap keyed by it carries the
// template (never the raw path) without adding a global store or an extra
// async-context layer. A miss simply falls back to the fixed category.

const routePatterns = new WeakMap<Request, string>()

export function recordRoutePattern(request: Request, pattern: string): void {
  if (pattern.length > 0) {
    routePatterns.set(request, pattern)
  }
}

export function takeRoutePattern(request: Request): string | undefined {
  const pattern = routePatterns.get(request)
  routePatterns.delete(request)
  return pattern
}
