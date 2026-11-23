import { publicContract } from '@kobato/api/public-contract'
import { isContractProcedure } from '@orpc/contract'

// Anonymous public-read eligibility is DECLARED in `@kobato/api`: each eligible procedure carries
// `~orpc.meta.publicRead === true` (the `{ publicRead: true }` option of `defineProcedure`). This module only DERIVES
// the exemption set from that declaration and enforces it — it never derives eligibility from the route compatibility
// record (`~orpc.route.path`), never from the HTTP method (the RPC transport POSTs reads too), and never scans the
// account/admin trees. A newly added GET therefore gains no exemption automatically; opting a procedure in is a
// deliberate, security-sensitive change on the API side, pinned there by `@kobato/api`'s frozen-key tests.
function isContractTree(node: unknown): node is Record<string, unknown> {
  return typeof node === 'object' && node !== null && !isContractProcedure(node)
}

function collectPublicReadPaths(tree: Record<string, unknown>, prefix: string, paths: Set<string>): void {
  for (const [key, node] of Object.entries(tree)) {
    const treePath = prefix === '' ? key : `${prefix}/${key}`
    if (isContractProcedure(node)) {
      const meta: unknown = node['~orpc'].meta
      if (typeof meta === 'object' && meta !== null && 'publicRead' in meta && meta.publicRead === true) {
        // The RPC transport derives URLs from router tree keys, so the canonical path is the key path verbatim.
        paths.add(`/rpc/public/${treePath}`)
      }
    } else if (isContractTree(node)) {
      collectPublicReadPaths(node, treePath, paths)
    }
  }
}

const exemptPaths = ((): ReadonlySet<string> => {
  const paths = new Set<string>()
  collectPublicReadPaths(publicContract, '', paths)
  return paths
})()

/**
 * True only for the declared anonymous public-read RPC procedures — exact canonical-path match. No prefix matching, no
 * trailing-slash or lookalike tolerance: anything else (writes, token reads, account/admin, unknown paths, and the
 * removed pre-grouping aliases such as `/rpc/content/bootstrap`) fails closed and keeps the full CSRF validation.
 */
export function isPublicReadRpcPath(pathname: string): boolean {
  return exemptPaths.has(pathname)
}
