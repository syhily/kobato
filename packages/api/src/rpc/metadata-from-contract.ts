import { isContractProcedure } from '@orpc/contract'

function isContractTree(node: unknown): node is Record<string, unknown> {
  return typeof node === 'object' && node !== null && !isContractProcedure(node)
}

export function collectRpcMetadataFromContracts<T>(
  contract: Record<string, unknown>,
  select: (meta: unknown, path: string) => T | undefined,
): T[] {
  const selected: T[] = []
  function walk(tree: Record<string, unknown>, prefix: string): void {
    for (const [key, node] of Object.entries(tree)) {
      const treePath = prefix === '' ? key : `${prefix}/${key}`
      if (isContractProcedure(node)) {
        const value = select(node['~orpc'].meta, `/rpc/${treePath}`)
        if (value !== undefined) {
          selected.push(value)
        }
      } else if (isContractTree(node)) {
        walk(node, treePath)
      }
    }
  }
  walk(contract, '')
  return selected
}
