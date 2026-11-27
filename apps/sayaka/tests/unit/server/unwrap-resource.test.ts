import type { KobatoResourceStream } from '@kobato/api/client/resource-stream'
import type { MediaResourceOutput } from '@kobato/api/contracts/primitives'

import { unsafeCast } from '@kobato/base/utils/unsafe-cast'
import { ORPCError } from '@orpc/contract'
import { unwrapResource } from '@sayaka/server/unwrap'
import { describe, expect, it, vi } from 'vitest'

function fakeCapture(status: number): KobatoResourceStream {
  const headers = new Headers({
    'Content-Type': 'font/woff2',
    'Cache-Control': 'public, max-age=31536000, immutable, no-transform',
    ETag: '"57-1795684055254"',
    'Accept-Ranges': 'bytes',
    'X-Content-Type-Options': 'nosniff',
    'Content-Length': '11',
  })
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('woff2-bytes'))
      controller.close()
    },
  })
  return { status, headers, body }
}

async function readAll(response: Response): Promise<string> {
  const chunks: string[] = []
  for await (const chunk of response.body!) {
    chunks.push(new TextDecoder().decode(chunk))
  }
  return chunks.join('')
}

describe('unwrapResource — the siphoned stream branch', () => {
  it('builds the browser response from the captured transport: status, exact headers, piped body', async () => {
    const promise = Promise.resolve(unsafeCast<MediaResourceOutput>(undefined))
    const response = await unwrapResource(promise, {
      profile: 'media',
      takeStream: () => fakeCapture(206),
    })
    expect(response.status).toBe(206)
    expect(response.headers.get('Content-Type')).toBe('font/woff2')
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable, no-transform')
    expect(response.headers.get('ETag')).toBe('"57-1795684055254"')
    expect(response.headers.get('Accept-Ranges')).toBe('bytes')
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(response.headers.get('Content-Length')).toBe('11')
    expect(response.headers.get('Set-Cookie')).toBeNull()
    await expect(readAll(response)).resolves.toBe('woff2-bytes')
  })

  it('throws when a stream answer arrives without its captured transport', async () => {
    await expect(
      unwrapResource(Promise.resolve(unsafeCast<MediaResourceOutput>(undefined)), { takeStream: () => null }),
    ).rejects.toThrow('captured transport')
  })

  it('cancels the captured body when the relayed response is discarded', async () => {
    let cancelled = false
    const body = new ReadableStream<Uint8Array>({
      cancel: () => {
        cancelled = true
      },
    })
    const response = await unwrapResource(Promise.resolve(unsafeCast<MediaResourceOutput>(undefined)), {
      takeStream: () => ({ status: 200, headers: new Headers(), body }),
    })
    await response.body!.cancel()
    expect(cancelled).toBe(true)
  })

  it('translates SERVICE_UNAVAILABLE to a plain-text 503', async () => {
    const promise = Promise.reject(new ORPCError('SERVICE_UNAVAILABLE', { message: 'storage unavailable' }))
    const response = await unwrapResource(promise, { profile: 'media' }).then(
      (value) => value,
      (error: unknown) => unsafeCast<Response>(error),
    )
    expect(response.status).toBe(503)
    expect(response.headers.get('Content-Type')).toBe('text/plain; charset=utf-8')
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    await expect(response.text()).resolves.toBe('storage unavailable')
  })
})

describe('unwrapResource — envelope answers win over a stale capture', () => {
  it('relays a not-modified envelope even when a captured stream is still held for the procedure', async () => {
    const takeStream = vi.fn(() => fakeCapture(200))
    const response = await unwrapResource(
      Promise.resolve({
        kind: 'not-modified',
        etag: '"9-100"',
        contentType: 'font/woff2',
        cacheControl: 'public, max-age=31536000, immutable, no-transform',
        contentLanguage: null,
      }),
      { profile: 'media', takeStream },
    )
    expect(response.status).toBe(304)
    expect(response.headers.get('ETag')).toBe('"9-100"')
    expect(response.headers.get('Content-Type')).toBe('font/woff2')
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable, no-transform')
    expect(response.headers.get('Accept-Ranges')).toBe('bytes')
    await expect(response.text()).resolves.toBe('')
    expect(takeStream).not.toHaveBeenCalled()
  })

  it('relays a redirect envelope even when a captured stream is still held for the procedure', async () => {
    const response = await unwrapResource(
      Promise.resolve({
        kind: 'redirect',
        location: 'https://assets.example.com/fonts/a/result.css',
        cacheControl: 'public, max-age=300',
      }),
      { profile: 'media', takeStream: () => fakeCapture(200) },
    )
    expect(response.status).toBe(302)
    expect(response.headers.get('Location')).toBe('https://assets.example.com/fonts/a/result.css')
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=300')
    await expect(response.text()).resolves.toBe('')
  })
})
