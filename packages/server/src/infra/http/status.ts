import type { Buffer } from 'node:buffer'

export function notFound(message = 'Not Found'): never {
  throw new Response(message, { status: 404 })
}

export function pngResponse(buffer: Buffer | Uint8Array, headers?: HeadersInit): Response {
  const responseHeaders = new Headers(headers)
  responseHeaders.set('Content-Type', 'image/png')
  return new Response(new Uint8Array(buffer), {
    headers: responseHeaders,
  })
}
