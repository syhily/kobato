// @vitest-environment node
import { visitorAddress } from '@sayaka/server/visitor-address'
import { describe, expect, it } from 'vitest'

const NO_TRUSTED_PROXIES: string[] = []

describe('visitorAddress', () => {
  it('derives the visitor address from the proxy headers when the direct peer is loopback', () => {
    const request = new Request('http://sayaka.local/', {
      headers: { 'x-forwarded-for': '203.0.113.9' },
    })
    expect(visitorAddress(request, '127.0.0.1', NO_TRUSTED_PROXIES)).toBe('203.0.113.9')
    expect(visitorAddress(request, '::1', NO_TRUSTED_PROXIES)).toBe('203.0.113.9')
  })

  it('prefers cf-connecting-ip over x-forwarded-for for a loopback peer', () => {
    const request = new Request('http://sayaka.local/', {
      headers: { 'cf-connecting-ip': '203.0.113.9', 'x-forwarded-for': '198.51.100.7' },
    })
    expect(visitorAddress(request, '127.0.0.1', NO_TRUSTED_PROXIES)).toBe('203.0.113.9')
  })

  it('falls back to the loopback peer itself when no proxy headers are present', () => {
    const request = new Request('http://sayaka.local/')
    expect(visitorAddress(request, '127.0.0.1', NO_TRUSTED_PROXIES)).toBe('127.0.0.1')
  })

  it('derives the visitor address from the headers when the peer is a configured trusted proxy', () => {
    const request = new Request('http://sayaka.local/', {
      headers: { 'x-forwarded-for': '203.0.113.9' },
    })
    expect(visitorAddress(request, '172.18.0.2', ['172.18.0.0/16'])).toBe('203.0.113.9')
  })

  it('ignores the proxy headers when the peer is neither loopback nor trusted', () => {
    const request = new Request('http://sayaka.local/', {
      headers: { 'x-forwarded-for': '203.0.113.9', 'cf-connecting-ip': '198.51.100.7' },
    })
    expect(visitorAddress(request, '192.0.2.10', NO_TRUSTED_PROXIES)).toBe('192.0.2.10')
    expect(visitorAddress(request, '192.0.2.10', ['10.0.0.0/8'])).toBe('192.0.2.10')
  })

  it('returns undefined when there is no direct peer', () => {
    const request = new Request('http://sayaka.local/', {
      headers: { 'x-forwarded-for': '203.0.113.9' },
    })
    expect(visitorAddress(request, undefined, NO_TRUSTED_PROXIES)).toBeUndefined()
  })
})
