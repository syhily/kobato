import { HTTP_SERVER_OPTIONS } from '@kobato/base/utils/http-server-options'
import { describe, expect, it } from 'vitest'

describe('utils/http-server-options', () => {
  it('is the frozen table every Kobato Node listener binds', () => {
    expect(HTTP_SERVER_OPTIONS).toEqual({
      headersTimeout: 20_000,
      requestTimeout: 0,
      connectionsCheckingInterval: 10_000,
    })
    expect(Object.isFrozen(HTTP_SERVER_OPTIONS)).toBe(true)
    expect(Object.keys(HTTP_SERVER_OPTIONS).sort()).toEqual([
      'connectionsCheckingInterval',
      'headersTimeout',
      'requestTimeout',
    ])
  })
})
