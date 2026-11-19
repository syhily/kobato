import { isBlockedFetchHost, isValidPasskeyDomain } from '@kobato/auth/network.ts'
import { describe, expect, it } from 'vitest'

describe('auth: network boundary', () => {
  describe('isBlockedFetchHost', () => {
    it('blocks localhost names and loopback IPs', () => {
      expect(isBlockedFetchHost('localhost')).toBe(true)
      expect(isBlockedFetchHost('foo.localhost')).toBe(true)
      expect(isBlockedFetchHost('0.0.0.0')).toBe(true)
      expect(isBlockedFetchHost('::1')).toBe(true)
      expect(isBlockedFetchHost('[::1]')).toBe(true)
      expect(isBlockedFetchHost('127.0.0.1')).toBe(true)
    })

    it('blocks private IPv4 ranges', () => {
      expect(isBlockedFetchHost('10.0.0.1')).toBe(true)
      expect(isBlockedFetchHost('192.168.1.1')).toBe(true)
      expect(isBlockedFetchHost('169.254.169.254')).toBe(true)
      expect(isBlockedFetchHost('172.16.0.1')).toBe(true)
    })

    it('blocks CGNAT, benchmarking, and IETF assignment ranges', () => {
      expect(isBlockedFetchHost('100.100.100.200')).toBe(true)
      expect(isBlockedFetchHost('100.64.0.1')).toBe(true)
      expect(isBlockedFetchHost('100.127.255.255')).toBe(true)
      expect(isBlockedFetchHost('198.18.0.1')).toBe(true)
      expect(isBlockedFetchHost('198.19.255.255')).toBe(true)
      expect(isBlockedFetchHost('192.0.0.1')).toBe(true)
      expect(isBlockedFetchHost('192.0.0.170')).toBe(true)
    })

    it('allows addresses just outside the added ranges', () => {
      expect(isBlockedFetchHost('100.63.255.255')).toBe(false)
      expect(isBlockedFetchHost('100.128.0.1')).toBe(false)
      expect(isBlockedFetchHost('198.17.255.255')).toBe(false)
      expect(isBlockedFetchHost('198.20.0.1')).toBe(false)
      expect(isBlockedFetchHost('192.0.1.1')).toBe(false)
      expect(isBlockedFetchHost('192.0.2.1')).toBe(false)
    })

    it('blocks IPv4-embedding IPv6 transition ranges (NAT64 and 6to4)', () => {
      expect(isBlockedFetchHost('64:ff9b::a9fe:a9fe')).toBe(true)
      expect(isBlockedFetchHost('[64:ff9b::a9fe:a9fe]')).toBe(true)
      expect(isBlockedFetchHost('64:ff9b::7f00:1')).toBe(true)
      expect(isBlockedFetchHost('64:ff9b::')).toBe(true)
      expect(isBlockedFetchHost('2002:7f00:1::')).toBe(true)
      expect(isBlockedFetchHost('2002:a9fe:a9fe::')).toBe(true)
    })

    it('allows public addresses outside the transition prefixes', () => {
      expect(isBlockedFetchHost('64:ff9b:1::808:808')).toBe(false) // RFC 8215 local-use prefix
      expect(isBlockedFetchHost('2003::1')).toBe(false)
      expect(isBlockedFetchHost('2606:4700::1')).toBe(false)
    })

    it('blocks IPv6 ULA / link-local ranges', () => {
      expect(isBlockedFetchHost('fc00::1')).toBe(true)
      expect(isBlockedFetchHost('fd12::1')).toBe(true)
      expect(isBlockedFetchHost('fe80::1')).toBe(true)
      expect(isBlockedFetchHost('[fc00::1]')).toBe(true)
    })

    it('blocks zone-ID-suffixed spellings of private IPv6 addresses', () => {
      expect(isBlockedFetchHost('fe80::1%eth0')).toBe(true) // RFC 6874 zone-ID
      expect(isBlockedFetchHost('fe80::1%25eth0')).toBe(true)
      expect(isBlockedFetchHost('[fe80::1%eth0]')).toBe(true)
      expect(isBlockedFetchHost('fc00::1%1')).toBe(true)
    })

    it('blocks IPv6 multicast (ff00::/8)', () => {
      expect(isBlockedFetchHost('ff02::1')).toBe(true)
      expect(isBlockedFetchHost('[ff02::1]')).toBe(true)
      expect(isBlockedFetchHost('ff05::2')).toBe(true)
      expect(isBlockedFetchHost('ff0e::1')).toBe(true)
    })

    it('blocks non-canonical IPv4 spellings of private addresses', () => {
      expect(isBlockedFetchHost('0x7f000001')).toBe(true)
      expect(isBlockedFetchHost('2130706433')).toBe(true)
      expect(isBlockedFetchHost('127.1')).toBe(true)
      expect(isBlockedFetchHost('0177.0.0.1')).toBe(true)
      expect(isBlockedFetchHost('0xA9FEA9FE')).toBe(true)
      expect(isBlockedFetchHost('10.1')).toBe(true)
    })

    it('blocks IPv4-mapped IPv6 forms of private addresses', () => {
      expect(isBlockedFetchHost('::ffff:127.0.0.1')).toBe(true)
      expect(isBlockedFetchHost('[::ffff:127.0.0.1]')).toBe(true)
      expect(isBlockedFetchHost('[::ffff:7f00:1]')).toBe(true)
      expect(isBlockedFetchHost('::ffff:169.254.169.254')).toBe(true)
      expect(isBlockedFetchHost('::ffff:10.0.0.1')).toBe(true)
    })

    it('blocks IPv6 loopback and unspecified addresses in any spelling', () => {
      expect(isBlockedFetchHost('0:0:0:0:0:0:0:1')).toBe(true)
      expect(isBlockedFetchHost('::')).toBe(true)
      expect(isBlockedFetchHost('0:0:0:0:0:0:0:0')).toBe(true)
    })

    it('still blocks 127-prefixed domain names via the literal first layer', () => {
      expect(isBlockedFetchHost('127.0.0.1.nip.io')).toBe(true)
    })

    it('allows public hosts and IPs', () => {
      expect(isBlockedFetchHost('gravatar.com')).toBe(false)
      expect(isBlockedFetchHost('p3.music.126.net')).toBe(false)
      expect(isBlockedFetchHost('example.com')).toBe(false)
      expect(isBlockedFetchHost('8.8.8.8')).toBe(false)
      expect(isBlockedFetchHost('0x08080808')).toBe(false)
      expect(isBlockedFetchHost('::ffff:8.8.8.8')).toBe(false)
      expect(isBlockedFetchHost('[::ffff:808:808]')).toBe(false)
      expect(isBlockedFetchHost('2606:4700::1%eth0')).toBe(false)
    })
  })

  describe('isValidPasskeyDomain', () => {
    it('accepts a public https origin', () => {
      expect(isValidPasskeyDomain('https://example.com')).toBe(true)
    })

    it('rejects http origins', () => {
      expect(isValidPasskeyDomain('http://example.com')).toBe(false)
    })

    it('rejects localhost and loopback addresses', () => {
      expect(isValidPasskeyDomain('https://localhost')).toBe(false)
      expect(isValidPasskeyDomain('https://127.0.0.1')).toBe(false)
      expect(isValidPasskeyDomain('https://[::1]')).toBe(false)
    })

    it('rejects private IPv4 ranges', () => {
      expect(isValidPasskeyDomain('https://10.0.0.1')).toBe(false)
      expect(isValidPasskeyDomain('https://192.168.1.1')).toBe(false)
    })

    it('rejects malformed input', () => {
      expect(isValidPasskeyDomain('not-a-url')).toBe(false)
      expect(isValidPasskeyDomain('')).toBe(false)
    })
  })
})
