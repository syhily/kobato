// Single owner of the shared HTTP status-throw helpers. The core SSR
// loaders and the public frontend routes both throw a `404` `Response`
// that React Router catches and routes to the `ErrorBoundary`.

// Throw a `404` Response that React Router catches and routes to the
// `ErrorBoundary`. Use from loaders/actions when a slug doesn't match any
// catalog entry.
export function notFound(message = 'Not Found'): never {
  throw new Response(message, { status: 404 })
}
