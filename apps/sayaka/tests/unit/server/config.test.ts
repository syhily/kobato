// @vitest-environment node
import { parseSayakaConfig } from '@sayaka/server/config'
import { describe, expect, it } from 'vitest'

describe('parseSayakaConfig', () => {
  it('applies the dev defaults', () => {
    const config = parseSayakaConfig({}, true)
    expect(config).toEqual({
      host: '0.0.0.0',
      port: 4322,
      kobatoRpcUrl: 'http://127.0.0.1:4321/rpc',
      kobatoOrigin: 'http://127.0.0.1:4321',
      kobatoTimeoutMs: 30_000,
      trustedProxies: [],
    })
  })

  it('parses the kobato upstream timeout override', () => {
    const config = parseSayakaConfig({ SAYAKA_KOBATO_TIMEOUT_MS: '45000' }, true)
    expect(config.kobatoTimeoutMs).toBe(45_000)
  })

  it('rejects a non-positive kobato timeout', () => {
    expect(() => parseSayakaConfig({ SAYAKA_KOBATO_TIMEOUT_MS: '0' }, true)).toThrow(/Invalid sayaka configuration/)
  })

  it('fails fast in production without the kobato RPC URL', () => {
    expect(() => parseSayakaConfig({}, false)).toThrow(/SAYAKA_KOBATO_RPC_URL is required/)
  })

  it('rejects a non-http RPC URL', () => {
    expect(() => parseSayakaConfig({ SAYAKA_KOBATO_RPC_URL: 'ftp://example.com/rpc' }, true)).toThrow(
      /must be a valid http\(s\) URL/,
    )
  })

  it('derives the kobato origin from the RPC URL', () => {
    const config = parseSayakaConfig({ SAYAKA_KOBATO_RPC_URL: 'https://kobato.internal:8443/rpc' }, false)
    expect(config.kobatoOrigin).toBe('https://kobato.internal:8443')
  })

  it('parses a comma-separated proxy list', () => {
    const config = parseSayakaConfig({ SAYAKA_TRUSTED_PROXIES: ' 10.0.0.1 , 172.18.0.0/16 ' }, true)
    expect(config.trustedProxies).toEqual(['10.0.0.1', '172.18.0.0/16'])
  })

  it('rejects invalid proxy entries', () => {
    expect(() => parseSayakaConfig({ SAYAKA_TRUSTED_PROXIES: 'not-an-ip' }, true)).toThrow(
      /SAYAKA_TRUSTED_PROXIES entries must be IP addresses or IPv4 CIDRs/,
    )
  })

  it('rejects a trust-everything proxy entry', () => {
    expect(() => parseSayakaConfig({ SAYAKA_TRUSTED_PROXIES: '0.0.0.0/0' }, true)).toThrow(/0\.0\.0\.0\/0/)
  })

  it('rejects an out-of-range port', () => {
    expect(() => parseSayakaConfig({ SAYAKA_PORT: '70000' }, true)).toThrow(/Invalid sayaka configuration/)
  })
})
