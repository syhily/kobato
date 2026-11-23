import { collectRpcMetadata } from '@kobato/api/rpc/metadata'

const exemptPaths = new Set(
  collectRpcMetadata((meta, path) => {
    if (typeof meta === 'object' && meta !== null && 'csrfExempt' in meta && meta.csrfExempt === true) {
      return path
    }
    return undefined
  }),
)

export function isCsrfExemptRpcPath(pathname: string): boolean {
  return exemptPaths.has(pathname)
}
