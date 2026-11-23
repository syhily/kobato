import { analyticsContract } from '@kobato/api/rpc/admin/analytics'
import { collectRpcMetadataFromContracts } from '@kobato/api/rpc/metadata-from-contract'
import { publicAnalyticsContract } from '@kobato/api/rpc/public/analytics'
import { publicObservabilityContract } from '@kobato/api/rpc/public/observability'

function excludedPaths(contract: Record<string, unknown>, prefix: string): string[] {
  return collectRpcMetadataFromContracts(contract, (meta, path) => {
    if (typeof meta === 'object' && meta !== null && 'telemetryExcluded' in meta && meta.telemetryExcluded === true) {
      return path.replace('/rpc/', `/rpc${prefix}/`)
    }
    return undefined
  })
}

export const TELEMETRY_EXCLUDED_RPC_PATHS: ReadonlySet<string> = new Set([
  ...excludedPaths(publicAnalyticsContract, '/public/analytics'),
  ...excludedPaths(publicObservabilityContract, '/public/observability'),
  ...excludedPaths(analyticsContract, '/admin/analytics'),
])
