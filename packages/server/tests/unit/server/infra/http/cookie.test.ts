import { parseCookieValue, serializeCookie } from '@kobato/server/infra/http/cookie'
import { describe, expect, it } from 'vitest'

describe('parseCookieValue', () => {
  it('returns the value of the named cookie among several', () => {
    expect(parseCookieValue('a=1; __session=abc; b=2', '__session')).toBe('abc')
  })

  it('trims spaces and tabs around name and value', () => {
    expect(parseCookieValue('__session = abc ', '__session')).toBe('abc')
    expect(parseCookieValue('\t__session\t=\tabc\t', '__session')).toBe('abc')
  })

  it('decodes percent-encoded values', () => {
    expect(parseCookieValue('__session=a%2Fb%3Dc', '__session')).toBe('a/b=c')
  })

  it('keeps the raw value when percent-decoding fails', () => {
    expect(parseCookieValue('__session=a%zz', '__session')).toBe('a%zz')
  })

  it('lets the first occurrence win on duplicate names', () => {
    expect(parseCookieValue('__session=one; __session=two', '__session')).toBe('one')
  })

  it('matches the name exactly', () => {
    expect(parseCookieValue('x__session=a', '__session')).toBeNull()
    expect(parseCookieValue('__sessionx=a', '__session')).toBeNull()
  })

  it('skips bare segments without an equals sign', () => {
    expect(parseCookieValue('bare; __session=a', '__session')).toBe('a')
  })

  it('returns null when the cookie is absent or the header is degenerate', () => {
    expect(parseCookieValue('other=1', '__session')).toBeNull()
    expect(parseCookieValue('', '__session')).toBeNull()
    expect(parseCookieValue('x', '__session')).toBeNull()
    expect(parseCookieValue('no-equals-here', '__session')).toBeNull()
  })
})

describe('serializeCookie', () => {
  it('serializes a bare name=value pair', () => {
    expect(serializeCookie('__session', 'abc')).toBe('__session=abc')
  })

  it('percent-encodes the value', () => {
    expect(serializeCookie('__session', 'a/b+c=;')).toBe('__session=a%2Fb%2Bc%3D%3B')
  })

  it('emits an empty value without encoding', () => {
    expect(serializeCookie('__session', '', { path: '/' })).toBe('__session=; Path=/')
  })

  it('emits attributes in the canonical order', () => {
    const header = serializeCookie('__session', 'v', {
      maxAge: 60,
      path: '/',
      expires: new Date(0),
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
    })
    expect(header).toBe(
      '__session=v; Max-Age=60; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax',
    )
  })

  it('clamps Max-Age to the cookie limit and to zero', () => {
    expect(serializeCookie('c', 'v', { maxAge: 1e9 })).toBe('c=v; Max-Age=34560000')
    expect(serializeCookie('c', 'v', { maxAge: -5 })).toBe('c=v; Max-Age=0')
  })

  it('renders every SameSite label', () => {
    expect(serializeCookie('c', 'v', { sameSite: 'strict' })).toBe('c=v; SameSite=Strict')
    expect(serializeCookie('c', 'v', { sameSite: 'none' })).toBe('c=v; SameSite=None')
  })
})
