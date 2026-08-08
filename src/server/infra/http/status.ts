import type { Buffer } from 'node:buffer'

// Thrown from loaders/actions; React Router routes it to the `ErrorBoundary`.
export function notFound(message = 'Not Found'): never {
  throw new Response(message, { status: 404 })
}

// Used by the OG/avatar/calendar image routes that build PNGs on demand.
export function pngResponse(buffer: Buffer | Uint8Array, headers?: HeadersInit): Response {
  const responseHeaders = new Headers(headers)
  responseHeaders.set('Content-Type', 'image/png')
  return new Response(new Uint8Array(buffer), {
    headers: responseHeaders,
  })
}
