import type { TimeoutOverride } from '@kobato/server/http/middlewares/request-timeout'

import { collectRpcMetadata } from '@kobato/api/rpc/metadata'

export const REQUEST_TIMEOUT_OVERRIDES: readonly TimeoutOverride[] = collectRpcMetadata((meta, prefix) => {
  if (typeof meta !== 'object' || meta === null || !('requestTimeoutMs' in meta)) {
    return undefined
  }
  return typeof meta.requestTimeoutMs === 'number' ? { prefix, timeoutMs: meta.requestTimeoutMs } : undefined
})
