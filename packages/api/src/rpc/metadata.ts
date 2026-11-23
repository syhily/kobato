import { apiContract } from '@kobato/api/contract'
import { collectRpcMetadataFromContracts } from '@kobato/api/rpc/metadata-from-contract'

export function collectRpcMetadata<T>(select: (meta: unknown, path: string) => T | undefined): T[] {
  return collectRpcMetadataFromContracts(apiContract, select)
}
