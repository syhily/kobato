import { publicContract } from '@kobato/api/public-contract'
import { isPublicReadRpcPath } from '@kobato/server/http/request/public-read-rpc-path'
import { describe, expect, it } from 'vitest'

const PUBLIC_READ_PATHS: readonly string[] = [
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
]

const LEGACY_ALIASES: readonly string[] = [
  '/rpc/content/bootstrap',
  '/rpc/content/home',
  '/rpc/content/posts/list',
  '/rpc/content/posts/bySlug',
  '/rpc/content/pages/bySlug',
  '/rpc/content/comments/byKey',
  '/rpc/content/search',
  '/rpc/content/categories/list',
  '/rpc/content/archives',
  '/rpc/comments/loadComments',
  '/rpc/webmentions/list',
  '/rpc/avatar/find',
  '/rpc/github/avatar',
  '/rpc/github/release',
  '/rpc/images/resolveThumbhash',
  '/rpc/music/get',
]

describe('isPublicReadRpcPath', () => {
  it.each(PUBLIC_READ_PATHS)('exempts the frozen canonical public-read procedure %s', (pathname) => {
    expect(isPublicReadRpcPath(pathname)).toBe(true)
  })

  it.each(LEGACY_ALIASES)('exempts the legacy alias %s exactly like its canonical path', (pathname) => {
    expect(isPublicReadRpcPath(pathname)).toBe(true)
  })

  it.each([
    '/rpc/public/comments/getRaw',
    '/rpc/comments/getRaw',
    '/rpc/public/comments/myComments',
    '/rpc/comments/myComments',
    '/rpc/public/comments/replyComment',
    '/rpc/comments/replyComment',
    '/rpc/public/comments/edit',
    '/rpc/comments/edit',
    '/rpc/public/comments/revokeToken',
    '/rpc/comments/revokeToken',
    '/rpc/account/notifications/list',
    '/rpc/notifications/list',
    '/rpc/account/likes/increase',
    '/rpc/likes/increase',
    '/rpc/admin/analytics/overview',
    '/rpc/analytics/overview',
    '/rpc/account/profile',
    '/rpc/public/content/notAProcedure',
    '/rpc/public/content/bootstrap/extra',
    '/rpc/public/content/bootstrap-x',
    '/rpc/public/content/bootstrap/',
    '/rpc/content/bootstrap/',
    '/rpc/webhooks/list',
    '/health',
  ])('fails closed for %s', (pathname) => {
    expect(isPublicReadRpcPath(pathname)).toBe(false)
  })

  it('conserves the exemption: every frozen canonical path terminates at a real publicContract procedure', () => {
    // The exemption is this frozen table, not anything derived — so a renamed or removed public procedure must break
    // here (and only here) to force the CSRF set back in sync. New procedures gain no alias automatically.
    for (const canonical of PUBLIC_READ_PATHS) {
      let node: unknown = publicContract
      for (const segment of canonical.slice('/rpc/public/'.length).split('/')) {
        expect(node, `${canonical}: walking into ${segment}`).toBeTypeOf('object')
        node = (node as Record<string, unknown>)[segment]
        expect(node, `${canonical}: segment ${segment} exists on publicContract`).toBeDefined()
      }
      expect(
        typeof node === 'object' && node !== null && '~orpc' in node,
        `${canonical} must terminate at an oRPC contract procedure`,
      ).toBe(true)
    }
  })
})
