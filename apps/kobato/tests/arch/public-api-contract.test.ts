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
  'comments.revokeToken': 'POST /comments/revoke-token',
  'comments.myComments': 'GET /comments/my-comments',
  'webmentions.list': 'GET /webmention/list',
  'avatar.find': 'GET /avatar/find',
  'github.avatar': 'GET /github/avatar',
  'github.release': 'GET /github/release',
  'images.resolveThumbhash': 'GET /image/resolve-thumbhash',
  'music.get': 'GET /music/get',
}

const PUBLIC_POST_PROCEDURES: readonly string[] = ['comments.replyComment', 'comments.edit', 'comments.revokeToken']

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

  it('exposes exactly the seven public domains', () => {
    expect(Object.keys(publicContract)).toEqual([
      'content',
      'comments',
      'webmentions',
      'avatar',
      'github',
      'images',
      'music',
    ])
  })

  it('pins every canonical RPC procedure key with its oc.route metadata', () => {
    expect([...publicProcedures.keys()].sort()).toEqual(Object.keys(PUBLIC_ROUTE_MANIFEST).sort())
    for (const [key, procedure] of publicProcedures) {
      expect(routeOf(procedure), key).toBe(PUBLIC_ROUTE_MANIFEST[key])
    }
  })

  it('pins the canonical /rpc/public/* transport paths derived from the tree keys', () => {
    // The oc.route values above are REST-style metadata; the /rpc/* transport URLs come from the TREE KEYS.
    // `content.home` answers at /rpc/public/content/home — the canonical grouped paths are the only transport
    // surface; the pre-grouping aliases (e.g. /rpc/content/home) are gone.
    const canonicalPaths = [...publicProcedures.keys()].sort().map((key) => `/rpc/public/${key.replaceAll('.', '/')}`)
    expect(canonicalPaths).toEqual([
      '/rpc/public/avatar/find',
      '/rpc/public/comments/edit',
      '/rpc/public/comments/getRaw',
      '/rpc/public/comments/loadComments',
      '/rpc/public/comments/myComments',
      '/rpc/public/comments/replyComment',
      '/rpc/public/comments/revokeToken',
      '/rpc/public/content/archives',
      '/rpc/public/content/bootstrap',
      '/rpc/public/content/categories/list',
      '/rpc/public/content/comments/byKey',
      '/rpc/public/content/home',
      '/rpc/public/content/pages/bySlug',
      '/rpc/public/content/posts/bySlug',
      '/rpc/public/content/posts/list',
      '/rpc/public/content/search',
      '/rpc/public/github/avatar',
      '/rpc/public/github/release',
      '/rpc/public/images/resolveThumbhash',
      '/rpc/public/music/get',
      '/rpc/public/webmentions/list',
    ])
  })

  it('keeps public mutations to the three deployed comment exceptions', () => {
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

  it('exposes the webmention receive endpoint only as a Hono resource, never an RPC', () => {
    expect(publicProcedures.has('webmentions.receive')).toBe(false)
    expect([...publicProcedures.keys()].filter((key) => key.startsWith('webmentions.'))).toEqual(['webmentions.list'])
  })
})
