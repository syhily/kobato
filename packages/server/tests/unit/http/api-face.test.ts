import { isTrustedProxy } from '@kobato/server/http/middlewares/api-face'
import { describe, expect, it } from 'vitest'

// The `api.trustedProxy` matcher — exact IP, dot-prefix, and IPv4 CIDR
// forms must all work (the config schema advertises "CIDR-ish prefixes",
// so a `10.0.0.0/8` entry that matches nothing would silently disable
// the exemption).

describe('isTrustedProxy', () => {
  it('matches exact IPs', () => {
    expect(isTrustedProxy('10.0.0.5', '10.0.0.5')).toBe(true)
    expect(isTrustedProxy('10.0.0.6', '10.0.0.5')).toBe(false)
  })

  it('matches plain dot-prefixes', () => {
    expect(isTrustedProxy('10.0.0.5', '10.0.')).toBe(true)
    expect(isTrustedProxy('10.1.2.3', '10.')).toBe(true)
    expect(isTrustedProxy('11.0.0.5', '10.')).toBe(false)
  })

  it('matches IPv4 CIDR entries', () => {
    expect(isTrustedProxy('10.1.2.3', '10.0.0.0/8')).toBe(true)
    expect(isTrustedProxy('192.168.1.200', '192.168.1.0/24')).toBe(true)
    expect(isTrustedProxy('192.168.2.1', '192.168.1.0/24')).toBe(false)
    expect(isTrustedProxy('203.0.113.9', '203.0.113.9/32')).toBe(true)
    expect(isTrustedProxy('203.0.113.10', '203.0.113.9/32')).toBe(false)
    expect(isTrustedProxy('10.0.0.1', '0.0.0.0/0')).toBe(true)
  })

  it('rejects malformed entries', () => {
    expect(isTrustedProxy('10.0.0.1', '10.0.0.0/33')).toBe(false)
    expect(isTrustedProxy('10.0.0.1', '10.0.0.0/abc')).toBe(false)
    expect(isTrustedProxy('10.0.0.1', '10.0.0.0/8/8')).toBe(false)
    expect(isTrustedProxy('10.0.0.1', 'not-an-ip')).toBe(false)
    expect(isTrustedProxy('not-an-ip', '10.0.0.0/8')).toBe(false)
  })
})
