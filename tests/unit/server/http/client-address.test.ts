import { describe, expect, it } from 'vitest'

import { getClientAddress } from '@/server/http/utils/client-address'

function buildRequest(headers: Record<string, string> = {}): Request {
  return new Request('https://example.com', { headers })
}

describe('server/http/utils/client-address — getClientAddress', () => {
  it('returns the direct ip when no proxy header is set', () => {
    expect(getClientAddress(buildRequest(), '203.0.113.1')).toBe('203.0.113.1')
  })

  it('returns the direct ip verbatim for remote connections even with proxy headers', () => {
    const req = buildRequest({ 'x-forwarded-for': '198.51.100.1' })
    expect(getClientAddress(req, '203.0.113.1')).toBe('203.0.113.1')
  })

  it('returns 127.0.0.1 by default when direct ip is omitted', () => {
    expect(getClientAddress(buildRequest())).toBe('127.0.0.1')
  })

  it('trusts cf-connecting-ip when direct connection is loopback', () => {
    const req = buildRequest({ 'cf-connecting-ip': '198.51.100.5' })
    expect(getClientAddress(req, '127.0.0.1')).toBe('198.51.100.5')
  })

  it('falls through cf-connecting-ip when the value is not a valid ip', () => {
    const req = buildRequest({
      'cf-connecting-ip': 'not-an-ip',
      'x-real-ip': '198.51.100.6',
    })
    expect(getClientAddress(req, '127.0.0.1')).toBe('198.51.100.6')
  })

  it('trusts x-real-ip when direct connection is loopback', () => {
    const req = buildRequest({ 'x-real-ip': '198.51.100.7' })
    expect(getClientAddress(req, '::1')).toBe('198.51.100.7')
  })

  it('uses the rightmost x-forwarded-for entry when loopback', () => {
    const req = buildRequest({ 'x-forwarded-for': '203.0.113.1, 198.51.100.10' })
    expect(getClientAddress(req, '127.0.0.1')).toBe('198.51.100.10')
  })

  it('skips malformed x-forwarded-for hops', () => {
    const req = buildRequest({ 'x-forwarded-for': 'garbage, 198.51.100.20' })
    expect(getClientAddress(req, '127.0.0.1')).toBe('198.51.100.20')
  })

  it('returns loopback when proxy headers are present but all malformed', () => {
    const req = buildRequest({ 'x-forwarded-for': 'not-an-ip' })
    expect(getClientAddress(req, '127.0.0.1')).toBe('127.0.0.1')
  })

  it('recognises ::ffff:127.0.0.1 as loopback', () => {
    const req = buildRequest({ 'x-real-ip': '198.51.100.30' })
    expect(getClientAddress(req, '::ffff:127.0.0.1')).toBe('198.51.100.30')
  })

  it('recognises other 127.x.x.x addresses as loopback', () => {
    const req = buildRequest({ 'x-real-ip': '198.51.100.40' })
    expect(getClientAddress(req, '127.1.2.3')).toBe('198.51.100.40')
  })
})
