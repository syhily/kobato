// Request-scoped route-template handoff from the React Router middleware to the
// Hono span.
//
// The Hono catch-all cannot know which React Router route matched, and the
// pattern only exists inside React Router's middleware. The Request object is
// shared across both layers, so a WeakMap keyed by it carries the template
// (never the raw path) without a global store or an extra async-context layer.
// A miss falls back to the fixed category.

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
