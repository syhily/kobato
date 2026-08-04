import type { Buffer } from 'node:buffer'

// Wrap a PNG byte buffer in a `Response` with the right `Content-Type`.
// Used by the OG/avatar/calendar image routes that build PNGs on demand
// (the shared `@kobato/shared/http/status` `notFound` throw helper lives
// in shared; this image-response helper is server-only).

export function pngResponse(buffer: Buffer | Uint8Array, headers?: HeadersInit): Response {
  const responseHeaders = new Headers(headers)
  responseHeaders.set('Content-Type', 'image/png')
  return new Response(new Uint8Array(buffer), {
    headers: responseHeaders,
  })
}
