import { apiContract } from '@kobato/api/contract'
import { publicContract } from '@kobato/api/public-contract'
import { describe, expect, it } from 'vitest'

const PUBLIC_ROUTE_MANIFEST: Record<string, string> = {
  'content.bootstrap': 'GET /content/bootstrap',
  'content.home': 'GET /content/home',
  'content.posts.list': 'GET /content/posts/list',
  'content.posts.bySlug': 'GET /content/posts/bySlug',
  'content.pages.bySlug': 'GET /content/pages/bySlug',
  'content.comments.byKey': 'GET /content/comments/byKey',
  'content.search': 'GET /content/search',
  'content.categories.list': 'GET /content/categories/list',
  'content.archives': 'GET /content/archives',
  'comments.replyComment': 'POST /comments/reply',
  'comments.loadComments': 'GET /comments/list',
  'comments.getRaw': 'GET /comments/get-raw',
  'comments.edit': 'POST /comments/edit',
  'comments.updateOwn': 'POST /comments/update-own',
  'comments.requestDeleteOwn': 'POST /comments/request-delete-own',
  'comments.cancelDeleteOwn': 'POST /comments/cancel-delete-own',
  'comments.revokeToken': 'POST /comments/revoke-token',
  'comments.myComments': 'GET /comments/my-comments',
  'likes.increase': 'POST /likes/increase',
  'likes.decrease': 'POST /likes/decrease',
  'likes.validate': 'GET /likes/validate',
  'friends.apply': 'POST /friends/apply',
  'notifications.list': 'GET /notifications/list',
  'notifications.unreadCount': 'GET /notifications/unread-count',
  'notifications.markRead': 'POST /notifications/mark-read',
  'notifications.markUnread': 'POST /notifications/mark-unread',
  'notifications.thread': 'GET /notifications/thread',
  'notifications.reply': 'POST /notifications/reply',
  'newsletter.subscribe': 'POST /newsletter/subscribe',
  'newsletter.confirm': 'POST /newsletter/confirm',
  'newsletter.unsubscribe': 'POST /newsletter/unsubscribe',
  'webmentions.list': 'GET /webmention/list',
  'avatar.find': 'GET /avatar/find',
  'github.avatar': 'GET /github/avatar',
  'github.release': 'GET /github/release',
  'images.resolveThumbhash': 'GET /image/resolve-thumbhash',
  'music.get': 'GET /music/get',
  'analytics.recordDeviceEnv': 'POST /analytics/env',
  'observability.rumStatus': 'GET /rum/status',
  'observability.rumIntake': 'POST /api/rum/intake/*',
  'webmentions.receive': 'POST /webmention',
  'feeds.rss': 'GET /feeds/rss',
  'feeds.atom': 'GET /feeds/atom',
  'sitemap.xml': 'GET /sitemap/xml',
  'images.og': 'GET /images/og',
  'images.calendar': 'GET /images/calendar',
  'avatar.image': 'GET /images/avatar',
  'branding.asset': 'GET /branding/asset',
  'fonts.embedded': 'GET /fonts/embedded',
  'storage.object': 'GET /storage/object',
}

const PUBLIC_POST_PROCEDURES: readonly string[] = [
  'comments.replyComment',
  'comments.edit',
  'comments.updateOwn',
  'comments.requestDeleteOwn',
  'comments.cancelDeleteOwn',
  'comments.revokeToken',
  'likes.increase',
  'likes.decrease',
  'friends.apply',
  'notifications.markRead',
  'notifications.markUnread',
  'notifications.reply',
  'newsletter.subscribe',
  'newsletter.confirm',
  'newsletter.unsubscribe',
  'analytics.recordDeviceEnv',
  'webmentions.receive',
  'observability.rumIntake',
]

interface ContractProcedure {
  '~orpc': { route: { method: string; path: string }; meta?: Record<string, unknown> }
}

function isContractProcedure(value: unknown): value is ContractProcedure {
  if (typeof value !== 'object' || value === null || !('~orpc' in value)) {
    return false
  }
  const meta = (value as { '~orpc': unknown })['~orpc']
  return typeof meta === 'object' && meta !== null && 'route' in meta
}

function flatten(value: unknown, prefix = '', out: Map<string, ContractProcedure> = new Map()) {
  if (isContractProcedure(value)) {
    out.set(prefix, value)
    return out
  }
  if (typeof value === 'object' && value !== null) {
    for (const [key, child] of Object.entries(value)) {
      flatten(child, prefix === '' ? key : `${prefix}.${key}`, out)
    }
  }
  return out
}

function routeOf(procedure: ContractProcedure): string {
  return `${procedure['~orpc'].route.method} ${procedure['~orpc'].route.path}`
}

describe('public API contract seam', () => {
  const publicProcedures = flatten(publicContract)

  it('exposes exactly the eighteen public domains', () => {
    expect(Object.keys(publicContract)).toEqual([
      'content',
      'comments',
      'likes',
      'friends',
      'notifications',
      'newsletter',
      'webmentions',
      'avatar',
      'github',
      'images',
      'music',
      'branding',
      'fonts',
      'storage',
      'analytics',
      'observability',
      'feeds',
      'sitemap',
    ])
  })

  it('pins every canonical RPC procedure key with its oc.route metadata', () => {
    expect([...publicProcedures.keys()].sort()).toEqual(Object.keys(PUBLIC_ROUTE_MANIFEST).sort())
    for (const [key, procedure] of publicProcedures) {
      expect(routeOf(procedure), key).toBe(PUBLIC_ROUTE_MANIFEST[key])
    }
  })

  it('pins the canonical /rpc/public/* transport paths derived from the tree keys', () => {
    const canonicalPaths = [...publicProcedures.keys()].sort().map((key) => `/rpc/public/${key.replaceAll('.', '/')}`)
    expect(canonicalPaths).toEqual([
      '/rpc/public/analytics/recordDeviceEnv',
      '/rpc/public/avatar/find',
      '/rpc/public/avatar/image',
      '/rpc/public/branding/asset',
      '/rpc/public/comments/cancelDeleteOwn',
      '/rpc/public/comments/edit',
      '/rpc/public/comments/getRaw',
      '/rpc/public/comments/loadComments',
      '/rpc/public/comments/myComments',
      '/rpc/public/comments/replyComment',
      '/rpc/public/comments/requestDeleteOwn',
      '/rpc/public/comments/revokeToken',
      '/rpc/public/comments/updateOwn',
      '/rpc/public/content/archives',
      '/rpc/public/content/bootstrap',
      '/rpc/public/content/categories/list',
      '/rpc/public/content/comments/byKey',
      '/rpc/public/content/home',
      '/rpc/public/content/pages/bySlug',
      '/rpc/public/content/posts/bySlug',
      '/rpc/public/content/posts/list',
      '/rpc/public/content/search',
      '/rpc/public/feeds/atom',
      '/rpc/public/feeds/rss',
      '/rpc/public/fonts/embedded',
      '/rpc/public/friends/apply',
      '/rpc/public/github/avatar',
      '/rpc/public/github/release',
      '/rpc/public/images/calendar',
      '/rpc/public/images/og',
      '/rpc/public/images/resolveThumbhash',
      '/rpc/public/likes/decrease',
      '/rpc/public/likes/increase',
      '/rpc/public/likes/validate',
      '/rpc/public/music/get',
      '/rpc/public/newsletter/confirm',
      '/rpc/public/newsletter/subscribe',
      '/rpc/public/newsletter/unsubscribe',
      '/rpc/public/notifications/list',
      '/rpc/public/notifications/markRead',
      '/rpc/public/notifications/markUnread',
      '/rpc/public/notifications/reply',
      '/rpc/public/notifications/thread',
      '/rpc/public/notifications/unreadCount',
      '/rpc/public/observability/rumIntake',
      '/rpc/public/observability/rumStatus',
      '/rpc/public/sitemap/xml',
      '/rpc/public/storage/object',
      '/rpc/public/webmentions/list',
      '/rpc/public/webmentions/receive',
    ])
  })

  it('keeps public mutations to the comment writes, likes, friend apply, the notification writes, newsletter, the anonymous device beacon, and the two inbound protocols', () => {
    const posts = [...publicProcedures]
      .filter(([, procedure]) => routeOf(procedure).startsWith('POST'))
      .map(([key]) => key)
    expect(posts.sort()).toEqual([...PUBLIC_POST_PROCEDURES].sort())
  })

  it('keeps the comment token reads on GET', () => {
    expect(routeOf(publicProcedures.get('comments.myComments')!)).toBe('GET /comments/my-comments')
    expect(routeOf(publicProcedures.get('comments.getRaw')!)).toBe('GET /comments/get-raw')
  })

  it('never mixes account or admin procedures into the public tree', () => {
    expect(apiContract.public).toBe(publicContract)

    const publicPaths = new Set([...publicProcedures.values()].map((procedure) => routeOf(procedure)))
    for (const path of publicPaths) {
      expect(path.startsWith('/account/'), path).toBe(false)
      expect(path.startsWith('/admin/'), path).toBe(false)
    }

    const nonPublicProcedures = [...flatten(apiContract.account).values(), ...flatten(apiContract.admin).values()]
    const overlap = nonPublicProcedures.filter((procedure) => publicPaths.has(routeOf(procedure)))
    expect(overlap.map(routeOf), 'account/admin procedures must not repeat a public oc.route').toEqual([])
  })

  it('answers the Webmention receive and the RUM intake as contract procedures, and marks neither an anonymous public read', () => {
    expect(publicProcedures.has('webmentions.receive')).toBe(true)
    expect(publicProcedures.has('observability.rumIntake')).toBe(true)
    for (const key of ['webmentions.receive', 'observability.rumIntake']) {
      const meta = publicProcedures.get(key)?.['~orpc'].meta
      expect(meta?.publicRead, key).toBeUndefined()
      expect(meta?.csrfExempt, key).toBe(true)
    }
    expect([...publicProcedures.keys()].filter((key) => key.startsWith('webmentions.')).sort()).toEqual([
      'webmentions.list',
      'webmentions.receive',
    ])
  })
})
