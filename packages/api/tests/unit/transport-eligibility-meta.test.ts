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
  it('exempts exactly the setup surface, bootstrap, the branding assets, RUM status, and the two inbound protocols from the install gate', () => {
    expect(markedPaths('installGateExempt')).toEqual([
      '/rpc/account/setup/install',
      '/rpc/account/setup/restore',
      '/rpc/account/setup/status',
      '/rpc/account/setup/verifyToken',
      '/rpc/public/branding/asset',
      '/rpc/public/content/bootstrap',
      '/rpc/public/observability/rumIntake',
      '/rpc/public/observability/rumStatus',
      '/rpc/public/webmentions/receive',
    ])
  })

  it('excludes exactly the device beacon, realtime events, RUM status, and the RUM intake from self telemetry', () => {
    expect(markedPaths('telemetryExcluded')).toEqual([...TELEMETRY_EXCLUDED_RPC_PATHS].sort())
    expect(markedPaths('telemetryExcluded')).toEqual([
      '/rpc/admin/analytics/events',
      '/rpc/public/analytics/recordDeviceEnv',
      '/rpc/public/observability/rumIntake',
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
