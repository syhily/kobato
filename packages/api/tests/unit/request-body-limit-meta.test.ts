import { collectRpcMetadata } from '@kobato/api/rpc/metadata'
import { describe, expect, it } from 'vitest'

const EXPECTED = new Map([
  ['/rpc/admin/backup/uploadRestoreDecrypt', { maxBytes: 64 * 1024, messageKey: 'error.api.payloadTooLarge' }],
  ['/rpc/admin/branding/upload', { maxBytes: 2 * 1024 * 1024, messageKey: 'common.error.uploadTooLarge' }],
  ['/rpc/admin/fonts/uploadCanvas', { maxBytes: 60 * 1024 * 1024, messageKey: 'common.error.uploadTooLarge' }],
  [
    '/rpc/admin/fonts/upload',
    { maxBytes: 60 * 1024 * 1024, messageKey: 'fonts.error.packageTooLarge', formatMaxBytes: true },
  ],
  ['/rpc/admin/geoip/upload', { maxBytes: 100 * 1024 * 1024, messageKey: 'common.error.uploadTooLarge' }],
  ['/rpc/admin/backup/uploadRestore', { maxBytes: 500 * 1024 * 1024, messageKey: 'backup.error.uploadTooLarge' }],
  ['/rpc/account/setup/restore', { maxBytes: 500 * 1024 * 1024, messageKey: 'backup.error.uploadTooLarge' }],
  ['/rpc/public/analytics/recordDeviceEnv', { maxBytes: 4 * 1024, messageKey: 'error.api.payloadTooLarge' }],
])

describe('requestBodyLimit metadata', () => {
  it('declares every first-party upload cap once on its procedure', () => {
    const limits = collectRpcMetadata((meta, path) => {
      if (typeof meta !== 'object' || meta === null || !('requestBodyLimit' in meta)) {
        return undefined
      }
      return [path, meta.requestBodyLimit] as const
    })
    expect(new Map(limits)).toEqual(EXPECTED)
  })
})
