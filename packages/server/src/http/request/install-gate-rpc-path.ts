import { collectRpcMetadata } from '@kobato/api/rpc/metadata'

const exemptPaths = new Set(
  collectRpcMetadata((meta, path) => {
    if (typeof meta === 'object' && meta !== null && 'installGateExempt' in meta && meta.installGateExempt === true) {
      return path
    }
    return undefined
  }),
)

export function isInstallGateExemptRpcPath(pathname: string): boolean {
  return exemptPaths.has(pathname)
}
