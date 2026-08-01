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

  it('returns a safe placeholder when the direct peer is unavailable', () => {
    expect(getClientAddress(buildRequest())).toBe('unknown')
  })

  // V3-09: when the socket reports no remoteAddress but a remotePort, the
  // caller keys on `port:<n>` (per-connection buckets). The non-IP peer is
  // never loopback, so it passes through verbatim and proxy headers stay
  // untrusted.
  it('passes a port-keyed direct peer through verbatim, ignoring proxy headers', () => {
    const req = buildRequest({ 'x-forwarded-for': '198.51.100.1' })
    expect(getClientAddress(req, 'port:43210')).toBe('port:43210')
  })

  // P0-5 regression: behind a Unix-socket reverse proxy the direct peer IP
  // is undefined. Trusting proxy headers in that case lets any remote
  // client spoof its IP and bypass every IP-keyed rate limit.
  it('does NOT trust cf-connecting-ip when the direct peer is unavailable', () => {
    const req = buildRequest({ 'cf-connecting-ip': '198.51.100.5' })
    expect(getClientAddress(req, undefined)).toBe('unknown')
  })

  it('does NOT trust x-real-ip when the direct peer is unavailable', () => {
    const req = buildRequest({ 'x-real-ip': '198.51.100.7' })
    expect(getClientAddress(req, undefined)).toBe('unknown')
  })

  it('does NOT trust x-forwarded-for when the direct peer is unavailable', () => {
    const req = buildRequest({ 'x-forwarded-for': '203.0.113.1, 198.51.100.10' })
    expect(getClientAddress(req, undefined)).toBe('unknown')
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
