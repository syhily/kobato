import type { Buffer } from 'node:buffer'

// Throw a `404` Response that React Router catches and routes to the
// `ErrorBoundary`. Use from loaders/actions when a slug doesn't match any
// catalog entry.
export function notFound(message = 'Not Found'): never {
  throw new Response(message, { status: 404 })
}

// Wrap a PNG byte buffer in a `Response` with the right `Content-Type`. Used
// by the OG/avatar/calendar image routes that build PNGs on demand.
export function pngResponse(buffer: Buffer | Uint8Array, headers?: HeadersInit): Response {
  const responseHeaders = new Headers(headers)
  responseHeaders.set('Content-Type', 'image/png')
  return new Response(new Uint8Array(buffer), {
    headers: responseHeaders,
  })
}
