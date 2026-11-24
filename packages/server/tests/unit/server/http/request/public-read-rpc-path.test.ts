import { accountContract } from '@kobato/api/account-contract'
import { adminContract } from '@kobato/api/admin-contract'
import { publicContract } from '@kobato/api/public-contract'
import { isPublicReadRpcPath } from '@kobato/server/http/request/public-read-rpc-path'
import { isContractProcedure } from '@orpc/contract'
import { describe, expect, it } from 'vitest'

const EXPECTED_PUBLIC_READ_PATHS: readonly string[] = [
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
  '/rpc/public/observability/rumStatus',
]

const REMOVED_LEGACY_ALIASES: readonly string[] = [
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

function leavesOf(tree: Record<string, unknown>, prefix = ''): Map<string, unknown> {
  const leaves = new Map<string, unknown>()
  for (const [key, node] of Object.entries(tree)) {
    const path = prefix === '' ? key : `${prefix}/${key}`
    if (isContractProcedure(node)) {
      leaves.set(path, node)
    } else if (typeof node === 'object' && node !== null) {
      for (const [nestedPath, nestedLeaf] of leavesOf(node as Record<string, unknown>, path)) {
        leaves.set(nestedPath, nestedLeaf)
      }
    }
  }
  return leaves
}

function publicReadMetaOf(leaf: unknown): unknown {
  return (leaf as { '~orpc': { meta: { publicRead?: unknown } } })['~orpc'].meta.publicRead
}

describe('isPublicReadRpcPath', () => {
  it.each(EXPECTED_PUBLIC_READ_PATHS)('exempts the declared canonical public-read procedure %s', (pathname) => {
    expect(isPublicReadRpcPath(pathname)).toBe(true)
  })

  it.each(REMOVED_LEGACY_ALIASES)('no longer exempts the removed pre-grouping alias %s', (pathname) => {
    expect(isPublicReadRpcPath(pathname)).toBe(false)
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

  it('exempts exactly the frozen set — no more, no fewer', () => {
    const exempt = [...leavesOf(publicContract).keys()]
      .map((key) => `/rpc/public/${key}`)
      .filter((pathname) => isPublicReadRpcPath(pathname))
      .sort()
    expect(exempt).toEqual([...EXPECTED_PUBLIC_READ_PATHS].sort())
  })

  it('tracks the api publicRead declaration — a public leaf is exempt iff its meta carries publicRead === true', () => {
    for (const [key, leaf] of leavesOf(publicContract)) {
      expect(isPublicReadRpcPath(`/rpc/public/${key}`), key).toBe(publicReadMetaOf(leaf) === true)
    }
    for (const [key, leaf] of leavesOf(publicContract)) {
      const expected = EXPECTED_PUBLIC_READ_PATHS.includes(`/rpc/public/${key}`)
      expect(publicReadMetaOf(leaf) === true, key).toBe(expected)
    }
  })

  it('grants no account or admin procedure the exemption', () => {
    for (const [key] of leavesOf(accountContract)) {
      expect(isPublicReadRpcPath(`/rpc/account/${key}`), key).toBe(false)
    }
    for (const [key] of leavesOf(adminContract)) {
      expect(isPublicReadRpcPath(`/rpc/admin/${key}`), key).toBe(false)
    }
  })
})
