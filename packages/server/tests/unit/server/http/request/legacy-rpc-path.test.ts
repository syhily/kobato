import { apiContract } from '@kobato/api/contract'
import { adaptLegacyRpcRequest, rewriteLegacyRpcPath } from '@kobato/server/http/request/legacy-rpc-path'
import { describe, expect, it } from 'vitest'

// FROZEN legacy alias inventory: the exact pre-grouping tree paths that already-deployed clients may still call.
// Never regenerate this from the current tree — the table documents the deployed pre-grouping surface, not the full
// alias behavior. The adapter rewrites every non-comments domain by PREFIX (`/rpc/<domain>/*` → `/rpc/<group>/<domain>/*`),
// so a NEW procedure under those domains automatically answers at its legacy-shaped alias too; only `comments` is
// frozen per-procedure (its two name sets decide the target group), so a new comments procedure is canonical-only.
// A moved or removed procedure must leave a dangling alias that the conservation test below catches.
const LEGACY_TO_CANONICAL: readonly (readonly [legacy: string, canonical: string])[] = [
  ['/rpc/content/bootstrap', '/rpc/public/content/bootstrap'],
  ['/rpc/content/home', '/rpc/public/content/home'],
  ['/rpc/content/posts/list', '/rpc/public/content/posts/list'],
  ['/rpc/content/posts/bySlug', '/rpc/public/content/posts/bySlug'],
  ['/rpc/content/pages/bySlug', '/rpc/public/content/pages/bySlug'],
  ['/rpc/content/comments/byKey', '/rpc/public/content/comments/byKey'],
  ['/rpc/content/search', '/rpc/public/content/search'],
  ['/rpc/content/categories/list', '/rpc/public/content/categories/list'],
  ['/rpc/content/archives', '/rpc/public/content/archives'],
  ['/rpc/avatar/find', '/rpc/public/avatar/find'],
  ['/rpc/github/avatar', '/rpc/public/github/avatar'],
  ['/rpc/github/release', '/rpc/public/github/release'],
  ['/rpc/images/resolveThumbhash', '/rpc/public/images/resolveThumbhash'],
  ['/rpc/music/get', '/rpc/public/music/get'],
  ['/rpc/webmentions/list', '/rpc/public/webmentions/list'],
  ['/rpc/likes/increase', '/rpc/account/likes/increase'],
  ['/rpc/likes/decrease', '/rpc/account/likes/decrease'],
  ['/rpc/likes/validate', '/rpc/account/likes/validate'],
  ['/rpc/friends/apply', '/rpc/account/friends/apply'],
  ['/rpc/newsletter/subscribe', '/rpc/account/newsletter/subscribe'],
  ['/rpc/newsletter/confirm', '/rpc/account/newsletter/confirm'],
  ['/rpc/newsletter/unsubscribe', '/rpc/account/newsletter/unsubscribe'],
  ['/rpc/notifications/list', '/rpc/account/notifications/list'],
  ['/rpc/notifications/unreadCount', '/rpc/account/notifications/unreadCount'],
  ['/rpc/notifications/markRead', '/rpc/account/notifications/markRead'],
  ['/rpc/notifications/markUnread', '/rpc/account/notifications/markUnread'],
  ['/rpc/notifications/thread', '/rpc/account/notifications/thread'],
  ['/rpc/notifications/reply', '/rpc/account/notifications/reply'],
  ['/rpc/passkey/authBegin', '/rpc/account/passkey/authBegin'],
  ['/rpc/analytics/counters', '/rpc/admin/analytics/counters'],
  ['/rpc/analytics/views', '/rpc/admin/analytics/views'],
  ['/rpc/analytics/heatmap', '/rpc/admin/analytics/heatmap'],
  ['/rpc/analytics/metrics', '/rpc/admin/analytics/metrics'],
  ['/rpc/analytics/export', '/rpc/admin/analytics/export'],
  ['/rpc/analytics/overview', '/rpc/admin/analytics/overview'],
  ['/rpc/analytics/mentions', '/rpc/admin/analytics/mentions'],
  ['/rpc/comments/replyComment', '/rpc/public/comments/replyComment'],
  ['/rpc/comments/loadComments', '/rpc/public/comments/loadComments'],
  ['/rpc/comments/getRaw', '/rpc/public/comments/getRaw'],
  ['/rpc/comments/edit', '/rpc/public/comments/edit'],
  ['/rpc/comments/revokeToken', '/rpc/public/comments/revokeToken'],
  ['/rpc/comments/myComments', '/rpc/public/comments/myComments'],
  ['/rpc/comments/updateOwn', '/rpc/account/comments/updateOwn'],
  ['/rpc/comments/requestDeleteOwn', '/rpc/account/comments/requestDeleteOwn'],
  ['/rpc/comments/cancelDeleteOwn', '/rpc/account/comments/cancelDeleteOwn'],
  ['/rpc/comments/loadMine', '/rpc/account/comments/loadMine'],
  ['/rpc/comments/searchMineEntities', '/rpc/account/comments/searchMineEntities'],
  ['/rpc/comments/myCounts', '/rpc/account/comments/myCounts'],
  ['/rpc/comments/resolveEntity', '/rpc/account/comments/resolveEntity'],
]

interface ContractProcedure {
  '~orpc': { route: { method: string; path: string } }
}

function isContractProcedure(value: unknown): value is ContractProcedure {
  if (typeof value !== 'object' || value === null || !('~orpc' in value)) {
    return false
  }
  const meta = (value as { '~orpc': unknown })['~orpc']
  return typeof meta === 'object' && meta !== null && 'route' in meta
}

describe('rewriteLegacyRpcPath', () => {
  it.each(LEGACY_TO_CANONICAL)(
    'rewrites the legacy tree path %s onto its grouped canonical path',
    (legacy, canonical) => {
      expect(rewriteLegacyRpcPath(legacy)).toBe(canonical)
    },
  )

  it.each([
    '/rpc/public/content/bootstrap',
    '/rpc/account/notifications/list',
    '/rpc/account/profile',
    '/rpc/admin/analytics/overview',
    '/rpc/admin/users/count',
    '/rpc/comments/unknownProcedure',
    '/rpc/webhook/event',
    '/rpc',
    '/rpc/content/bootstrap/',
    '/health',
    '/comments/list',
  ])('leaves the non-legacy path %s untouched', (pathname) => {
    expect(rewriteLegacyRpcPath(pathname)).toBeNull()
  })

  it('conserves every alias: each canonical target resolves to a real contract procedure on the grouped tree', () => {
    for (const [, canonical] of LEGACY_TO_CANONICAL) {
      let node: unknown = apiContract
      for (const segment of canonical.slice('/rpc/'.length).split('/')) {
        expect(node, `${canonical}: walking into ${segment}`).toBeTypeOf('object')
        node = (node as Record<string, unknown>)[segment]
        expect(node, `${canonical}: segment ${segment} exists on the tree`).toBeDefined()
      }
      expect(isContractProcedure(node), `${canonical} must terminate at an oRPC contract procedure`).toBe(true)
    }
  })
})

describe('adaptLegacyRpcRequest', () => {
  it('returns the very same Request instance when no rewrite applies', () => {
    const request = new Request('http://localhost/rpc/public/content/bootstrap')
    expect(adaptLegacyRpcRequest(request)).toBe(request)
  })

  it('preserves the query string, method, headers, and body on a rewritten POST', async () => {
    const request = new Request('http://localhost/rpc/likes/increase?page=2&tab=all', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-csrf-token': 'tok' },
      body: JSON.stringify({ key: 'post:1' }),
    })

    const adapted = adaptLegacyRpcRequest(request)

    expect(adapted.url).toBe('http://localhost/rpc/account/likes/increase?page=2&tab=all')
    expect(adapted.method).toBe('POST')
    expect(adapted.headers.get('x-csrf-token')).toBe('tok')
    expect(adapted.headers.get('content-type')).toBe('application/json')
    await expect(adapted.text()).resolves.toBe(JSON.stringify({ key: 'post:1' }))
  })

  it('keeps a rewritten GET bodyless', () => {
    const adapted = adaptLegacyRpcRequest(new Request('http://localhost/rpc/content/bootstrap?ifNoneMatch=%22v1%22'))

    expect(adapted.url).toBe('http://localhost/rpc/public/content/bootstrap?ifNoneMatch=%22v1%22')
    expect(adapted.method).toBe('GET')
    expect(adapted.body).toBeNull()
  })
})
