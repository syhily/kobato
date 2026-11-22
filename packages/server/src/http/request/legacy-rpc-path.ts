const RPC_PREFIX = '/rpc/'

// Legacy (pre-grouping) RPC tree keys. The RPCHandler matches procedure paths derived from the ROUTER TREE, so the
// grouped router no longer resolves these URLs; this adapter rewrites them onto the canonical grouped tree paths
// before the handler sees the request. The oc.route method/path metadata is a separate surface and never passes here.
const PUBLIC_DOMAINS: ReadonlySet<string> = new Set(['content', 'avatar', 'github', 'images', 'music', 'webmentions'])
const ACCOUNT_DOMAINS: ReadonlySet<string> = new Set(['likes', 'friends', 'newsletter', 'notifications', 'passkey'])
const COMMENTS_PUBLIC_PROCEDURES: ReadonlySet<string> = new Set([
  'replyComment',
  'loadComments',
  'getRaw',
  'edit',
  'revokeToken',
  'myComments',
])
const COMMENTS_ACCOUNT_PROCEDURES: ReadonlySet<string> = new Set([
  'updateOwn',
  'requestDeleteOwn',
  'cancelDeleteOwn',
  'loadMine',
  'searchMineEntities',
  'myCounts',
  'resolveEntity',
])

/**
 * Maps a legacy `/rpc/*` request pathname onto the canonical grouped tree path. Returns `null` when the pathname is
 * not a legacy RPC path (`public`/`account`/`admin` canonical prefixes, `account` self, `admin`, and unknown paths
 * all pass through untouched).
 */
export function rewriteLegacyRpcPath(pathname: string): string | null {
  if (!pathname.startsWith(RPC_PREFIX)) {
    return null
  }
  const rest = pathname.slice(RPC_PREFIX.length)
  if (rest === '' || rest.endsWith('/')) {
    return null
  }
  const segments = rest.split('/')
  const head = segments[0]
  const second = segments.length > 1 ? segments[1] : undefined

  let group: 'public' | 'account' | 'admin' | null = null
  if (PUBLIC_DOMAINS.has(head)) {
    group = 'public'
  } else if (ACCOUNT_DOMAINS.has(head)) {
    group = 'account'
  } else if (head === 'analytics') {
    group = 'admin'
  } else if (head === 'comments' && second !== undefined) {
    if (COMMENTS_PUBLIC_PROCEDURES.has(second)) {
      group = 'public'
    } else if (COMMENTS_ACCOUNT_PROCEDURES.has(second)) {
      group = 'account'
    }
  }
  if (group === null) {
    return null
  }
  return `${RPC_PREFIX}${group}/${rest}`
}

/**
 * Returns a Request whose URL carries the canonical grouped RPC path when `request` targets a legacy one; otherwise
 * returns the very same Request instance. Method, headers, body, and query string are preserved — the surrounding
 * RequestContext, CSRF guard, and per-procedure guards run exactly as before; only the handler-side procedure
 * matching sees the canonical path.
 */
export function adaptLegacyRpcRequest(request: Request): Request {
  const url = new URL(request.url)
  const rewritten = rewriteLegacyRpcPath(url.pathname)
  if (rewritten === null) {
    return request
  }
  url.pathname = rewritten
  return new Request(url, {
    method: request.method,
    headers: request.headers,
    body: request.body,
    duplex: 'half',
  } as RequestInit)
}
