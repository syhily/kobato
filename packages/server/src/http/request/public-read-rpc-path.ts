import { collectRpcMetadata } from '@kobato/api/rpc/metadata'

const exemptPaths = new Set(
  collectRpcMetadata((meta, path) => {
    if (typeof meta === 'object' && meta !== null && 'publicRead' in meta && meta.publicRead === true) {
      return path
    }
    return undefined
  }),
)

export function isPublicReadRpcPath(pathname: string): boolean {
  return exemptPaths.has(pathname)
}
