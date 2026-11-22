import { rewriteLegacyRpcPath } from '@kobato/server/http/request/legacy-rpc-path'

// FROZEN anonymous public-read procedure surface. The oRPC RPC protocol carries reads as POSTs too, so this cannot
// be an HTTP-method exemption — it is the exact set of stateless public-read procedures, deliberately hand-listed
// (never derived from oc.route metadata) so a future sensitive GET can never gain the exemption by accident. Token
// reads (comments getRaw/myComments), every mutation, and the whole account/admin surface stay behind the CSRF guard.
const PUBLIC_READ_RPC_PATHS: ReadonlySet<string> = new Set([
  '/rpc/public/content/bootstrap',
  '/rpc/public/content/home',
  '/rpc/public/content/posts/list',
  '/rpc/public/content/posts/bySlug',
  '/rpc/public/content/pages/bySlug',
  '/rpc/public/content/comments/byKey',
  '/rpc/public/content/search',
  '/rpc/public/content/categories/list',
  '/rpc/public/content/archives',
  '/rpc/public/comments/loadComments',
  '/rpc/public/webmentions/list',
  '/rpc/public/avatar/find',
  '/rpc/public/github/avatar',
  '/rpc/public/github/release',
  '/rpc/public/images/resolveThumbhash',
  '/rpc/public/music/get',
])

/**
 * True only for the frozen anonymous public-read RPC procedures — exact canonical match after normalizing a legacy
 * alias, so `/rpc/content/bootstrap` and `/rpc/public/content/bootstrap` are equivalent. No prefix matching, no
 * trailing-slash or lookalike tolerance: anything else (writes, token reads, account/admin, unknown paths) fails
 * closed and keeps the full CSRF validation.
 */
export function isPublicReadRpcPath(pathname: string): boolean {
  const canonical = rewriteLegacyRpcPath(pathname) ?? pathname
  return PUBLIC_READ_RPC_PATHS.has(canonical)
}
