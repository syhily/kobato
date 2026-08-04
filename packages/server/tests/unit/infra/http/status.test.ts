import { pngResponse } from '@kobato/server/infra/http/png-response'
import { notFound } from '@kobato/shared/http/status'
import { describe, expect, expectTypeOf, it } from 'vitest'

describe('shared/http/status — notFound', () => {
  it('throws a Response with status 404 and the given message', () => {
    expect(() => notFound()).toThrow(Response)
    try {
      notFound('missing')
    } catch (e) {
      expect(e).toBeInstanceOf(Response)
      expect((e as Response).status).toBe(404)
    }
  })

  it('uses the default message when none provided', () => {
    try {
      notFound()
    } catch (e) {
      expect((e as Response).status).toBe(404)
    }
  })

  it('returns `never` so callers do not need to throw again', () => {
    const fn = (): never => notFound()
    expectTypeOf(fn).returns.toBeNever()
  })
})

describe('server/infra/http/png-response — pngResponse', () => {
  it('wraps a Buffer with the image/png content type', async () => {
    const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47])
    const res = pngResponse(buffer)
    expect(res.headers.get('Content-Type')).toBe('image/png')
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array(buffer))
  })

  it('accepts a Uint8Array directly', async () => {
    const buffer = new Uint8Array([0x89, 0x50])
    const res = pngResponse(buffer)
    expect(res.headers.get('Content-Type')).toBe('image/png')
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(buffer)
  })

  it('merges additional caller-supplied headers', () => {
    const res = pngResponse(Buffer.from([]), { 'Cache-Control': 'max-age=60' })
    expect(res.headers.get('Cache-Control')).toBe('max-age=60')
    expect(res.headers.get('Content-Type')).toBe('image/png')
  })
})
