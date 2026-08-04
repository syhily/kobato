import { isLoopbackIp, resolveProxyAddress } from '@kobato/shared/http/proxy-address'
import { describe, expect, it } from 'vitest'

// The trust model is the contract between the frontend's write proxy
// (what it forwards) and core (what it honours) — both import this single
// implementation. These cases pin the precedence and the loopback gate.

describe('isLoopbackIp', () => {
  it('recognises the loopback forms (v4, v6, v4-mapped)', () => {
    expect(isLoopbackIp('127.0.0.1')).toBe(true)
    expect(isLoopbackIp('127.8.9.10')).toBe(true)
    expect(isLoopbackIp('::1')).toBe(true)
    expect(isLoopbackIp('::ffff:127.0.0.1')).toBe(true)
  })

  it('rejects remote addresses and non-IP values', () => {
    expect(isLoopbackIp('192.168.1.1')).toBe(false)
    expect(isLoopbackIp('2001:db8::1')).toBe(false)
    expect(isLoopbackIp('not-an-ip')).toBe(false)
  })
})

describe('resolveProxyAddress', () => {
  const headers = {
    cfConnectingIp: null,
    realIp: null,
    forwardedFor: null,
  }

  it('returns null without a direct peer (headers never trusted)', () => {
    expect(resolveProxyAddress(null, { ...headers, cfConnectingIp: '1.2.3.4' })).toBeNull()
  })

  it('returns the remote direct address verbatim, ignoring forged headers', () => {
    const direct = '203.0.113.9'
    expect(
      resolveProxyAddress(direct, {
        cfConnectingIp: '198.51.100.7',
        realIp: '198.51.100.8',
        forwardedFor: '198.51.100.9',
      }),
    ).toBe(direct)
  })

  it('prefers CF-Connecting-IP over X-Real-IP over the XFF chain', () => {
    const direct = '127.0.0.1'
    expect(resolveProxyAddress(direct, { ...headers, cfConnectingIp: '198.51.100.1' })).toBe('198.51.100.1')
    expect(
      resolveProxyAddress(direct, { cfConnectingIp: '198.51.100.1', realIp: '198.51.100.2', forwardedFor: '1.1.1.1' }),
    ).toBe('198.51.100.1')
    expect(resolveProxyAddress(direct, { ...headers, realIp: '198.51.100.2' })).toBe('198.51.100.2')
    expect(resolveProxyAddress(direct, { ...headers, forwardedFor: '198.51.100.3, 198.51.100.4' })).toBe('198.51.100.4')
  })

  it('takes the rightmost VALID XFF hop, skipping garbage', () => {
    expect(resolveProxyAddress('127.0.0.1', { ...headers, forwardedFor: 'garbage, 198.51.100.5' })).toBe('198.51.100.5')
    expect(resolveProxyAddress('::1', { ...headers, forwardedFor: '198.51.100.6, garbage' })).toBe('198.51.100.6')
  })

  it('skips invalid cf/real values and falls through the chain', () => {
    expect(
      resolveProxyAddress('127.0.0.1', {
        cfConnectingIp: 'not-an-ip',
        realIp: '',
        forwardedFor: '203.0.113.1',
      }),
    ).toBe('203.0.113.1')
  })

  it('falls back to the loopback direct address when no header is valid', () => {
    expect(resolveProxyAddress('127.0.0.1', headers)).toBe('127.0.0.1')
    expect(resolveProxyAddress('127.0.0.1', { ...headers, forwardedFor: 'garbage' })).toBe('127.0.0.1')
  })
})
