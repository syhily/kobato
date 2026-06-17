import { describe, expect, it } from 'vitest'

import { maskIp, maskUa } from '@/ui/lib/mask'

describe('maskIp', () => {
  it('returns null for nullish inputs', () => {
    expect(maskIp(null)).toBeNull()
    expect(maskIp(undefined)).toBeNull()
    expect(maskIp('')).toBeNull()
  })

  it('masks IPv4 addresses', () => {
    expect(maskIp('192.168.1.100')).toBe('192.168.*.*')
    expect(maskIp('10.0.0.1')).toBe('10.0.*.*')
  })

  it('falls through to prefix masking for IPv4 strings that do not have 4 parts', () => {
    expect(maskIp('192.168.1')).toBe('192.****')
  })

  it('masks IPv6 addresses with at least 3 groups', () => {
    expect(maskIp('2001:0db8:85a3:0000:0000:8a2e:0370:7334')).toBe('2001:0db8:****')
    expect(maskIp('fe80::1')).toBe('fe80::****')
  })

  it('falls back to prefix masking for non-IP strings', () => {
    expect(maskIp('hello-world')).toBe('hell****')
    expect(maskIp('abc')).toBe('****')
  })
})

describe('maskUa', () => {
  it('returns null for nullish inputs', () => {
    expect(maskUa(null)).toBeNull()
    expect(maskUa(undefined)).toBeNull()
    expect(maskUa('')).toBeNull()
  })

  it('short strings stay unchanged', () => {
    expect(maskUa('Mozilla/5.0')).toBe('Mozilla/5.0')
  })

  it('truncates long user agents to 50 chars with ellipsis', () => {
    const ua =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    expect(maskUa(ua)).toBe(ua.slice(0, 50) + '...')
  })
})
