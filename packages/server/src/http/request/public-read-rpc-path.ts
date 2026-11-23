import { collectRpcMetadata } from '@kobato/api/rpc/metadata'

const exemptPaths = new Set(
  collectRpcMetadata((meta, path) => {
    if (typeof meta === 'object' && meta !== null && 'publicRead' in meta && meta.publicRead === true) {
      return path
    }
    return undefined
  }),
)

/**
 * True only for declared anonymous public-read RPC procedures — exact canonical-path match. Eligibility is never
 * inferred from route metadata or HTTP method, and account/admin paths fail closed even when shaped like public reads.
 */
export function isPublicReadRpcPath(pathname: string): boolean {
  return exemptPaths.has(pathname)
}
