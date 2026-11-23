import { apiContract } from '@kobato/api/contract'
import { collectRpcMetadata } from '@kobato/api/rpc/metadata'
import { TELEMETRY_EXCLUDED_RPC_PATHS } from '@kobato/api/rpc/telemetry'
import { describe, expect, it } from 'vitest'

function markedPaths(flag: 'installGateExempt' | 'telemetryExcluded'): string[] {
  return collectRpcMetadata((meta, path) => {
    if (typeof meta === 'object' && meta !== null && flag in meta && Reflect.get(meta, flag) === true) {
      return path
    }
    return undefined
  }).sort()
}

describe('install-gate and telemetry metadata', () => {
  it('exempts exactly setup restore and RUM status from the install gate', () => {
    expect(markedPaths('installGateExempt')).toEqual([
      '/rpc/account/setup/restore',
      '/rpc/public/observability/rumStatus',
    ])
  })

  it('excludes exactly the device beacon, realtime events, and RUM status from self telemetry', () => {
    expect(markedPaths('telemetryExcluded')).toEqual([...TELEMETRY_EXCLUDED_RPC_PATHS].sort())
    expect(markedPaths('telemetryExcluded')).toEqual([
      '/rpc/admin/analytics/events',
      '/rpc/public/analytics/recordDeviceEnv',
      '/rpc/public/observability/rumStatus',
    ])
  })

  it('composes independent metadata on RUM status instead of splitting declarations', () => {
    expect(apiContract.public.observability.rumStatus['~orpc'].meta).toEqual({
      publicRead: true,
      installGateExempt: true,
      telemetryExcluded: true,
    })
  })
})
