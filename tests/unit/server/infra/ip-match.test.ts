import { describe, expect, it } from 'vitest'

import { isValidTrustedProxyEntry, matchesTrustedProxy } from '@/server/infra/ip-match'

describe('server/infra/ip-match — isValidTrustedProxyEntry', () => {
  it('accepts exact IPv4 and IPv6 addresses', () => {
    expect(isValidTrustedProxyEntry('172.18.0.2')).toBe(true)
    expect(isValidTrustedProxyEntry('::1')).toBe(true)
    expect(isValidTrustedProxyEntry('fd00::5')).toBe(true)
  })

  it('accepts IPv4 CIDR ranges across the prefix spectrum', () => {
    expect(isValidTrustedProxyEntry('0.0.0.0/0')).toBe(true)
    expect(isValidTrustedProxyEntry('172.18.0.0/16')).toBe(true)
    expect(isValidTrustedProxyEntry('10.0.0.1/32')).toBe(true)
  })

  it('rejects malformed entries', () => {
    const bad = ['', 'not-an-ip', '999.1.1.1', '172.18.0.0/33', '172.18.0.0/-1', '172.18.0.0/abc', '172.18.0.0/', '/16']
    for (const entry of bad) {
      expect(isValidTrustedProxyEntry(entry)).toBe(false)
    }
  })

  it('rejects IPv6 CIDRs — v6 proxies match exactly', () => {
    expect(isValidTrustedProxyEntry('fd00::/64')).toBe(false)
    expect(isValidTrustedProxyEntry('::/0')).toBe(false)
  })
})

describe('server/infra/ip-match — matchesTrustedProxy', () => {
  const entries = ['172.18.0.0/16', '10.0.0.7', 'fd00::5']

  it('matches a peer inside an IPv4 CIDR', () => {
    expect(matchesTrustedProxy('172.18.0.2', entries)).toBe(true)
    expect(matchesTrustedProxy('172.18.255.254', entries)).toBe(true)
  })

  it('rejects a peer outside the CIDR', () => {
    expect(matchesTrustedProxy('172.19.0.2', entries)).toBe(false)
    expect(matchesTrustedProxy('172.17.255.255', entries)).toBe(false)
  })

  it('matches exact IPv4 and IPv6 entries', () => {
    expect(matchesTrustedProxy('10.0.0.7', entries)).toBe(true)
    expect(matchesTrustedProxy('fd00::5', entries)).toBe(true)
  })

  it('rejects everything with an empty list', () => {
    expect(matchesTrustedProxy('127.0.0.1', [])).toBe(false)
  })

  it('a /0 range matches any IPv4 peer but never an IPv6 peer', () => {
    expect(matchesTrustedProxy('203.0.113.9', ['0.0.0.0/0'])).toBe(true)
    expect(matchesTrustedProxy('fd00::9', ['0.0.0.0/0'])).toBe(false)
  })

  it('CIDR entries never match IPv6 peers, exact entries never match across families', () => {
    expect(matchesTrustedProxy('fd00::2', ['172.18.0.0/16'])).toBe(false)
    expect(matchesTrustedProxy('172.18.0.2', ['fd00::5'])).toBe(false)
  })
})
