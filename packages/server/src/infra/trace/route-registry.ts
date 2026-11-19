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
