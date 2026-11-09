import { describe, expect, it } from 'vitest'

import { sanitizeResourceUrl } from '@/client/lib/rum-url-policy'

describe('RUM resource URL policy', () => {
  it('keeps generated same-origin /assets paths and strips query/fragment', () => {
    expect(
      sanitizeResourceUrl('http://localhost:4321/assets/index-CwQAiHu_.js?v=1#frag', 'http://localhost:4321'),
    ).toBe('/assets/index-CwQAiHu_.js')
  })

  it.each([
    ['/rpc/content.home', '/rpc/content.home'],
    ['/rpc/content/home', '/rpc/content.home'],
    ['/rpc/content/posts/bySlug?slug=secret', '/rpc/content.posts.bySlug'],
    ['/rpc/admin/posts/mySummary?x=1#frag', '/rpc/admin.posts.mySummary'],
    ['/posts/secret-slug.data?draft=true', '/posts/:slug.data'],
    ['/search/secret%20term?page=2', '/search/:keyword'],
    ['/search/secret%20term/page/3', '/search/:keyword/page/:num'],
    ['/cats/secret-cat/page/2', '/cats/:slug/page/:num'],
    ['/tags/secret-tag/feed/atom', '/tags/:slug/feed'],
    ['/page/4', '/page/:num'],
    ['/admin/posts/42/analytics', '/admin/posts/:postId/analytics'],
    ['/admin/security/users/42', '/admin/security/users/:id'],
    ['/admin/library/music/42', '/admin/library/music/:id'],
    ['/admin/analytics', '/admin/analytics'],
    ['/admin/private/desk', '/admin/:path'],
    ['/editor/post/7', '/editor/post/:id'],
    ['/editor/page/8', '/editor/page/:id'],
    ['/images/og/cats/private-slug.png?x=1', '/images/:asset'],
    ['/storage/uploads/private.jpg?X-Amz-Signature=abc', '/storage/:key'],
    ['/api/admin/backup/download/secret-token', '/api/admin/backup/download/:id'],
    ['/api/admin/anything/else', '/api/:endpoint'],
    ['/private-page', '/:slug'],
    ['/src/root.tsx', '/src/root.tsx'],
    ['/src/styles/public.css?direct', '/src/styles/public.css'],
    ['/src/routes/public/post/detail.tsx?t=123', '/src/routes/public/post/detail.tsx'],
    ['/@vite/client?t=123', '/@vite/client'],
    ['/@vite/env', '/@vite/env'],
    ['/@react-refresh', '/@react-refresh'],
    ['/node_modules/.vite/deps/react.js?v=abc', '/node_modules/.vite/deps/react.js'],
    ['/node_modules/.vite/deps/chunk-AbC123.js', '/node_modules/.vite/deps/chunk-AbC123.js'],
  ])('folds %s into the declared family %s', (path, family) => {
    expect(sanitizeResourceUrl(`http://localhost:4321${path}`, 'http://localhost:4321')).toBe(family)
  })

  it('drops self-telemetry, probe, and intake paths', () => {
    const origin = 'http://localhost:4321'
    expect(sanitizeResourceUrl(`${origin}/api/analytics/env`, origin)).toBeNull()
    expect(sanitizeResourceUrl(`${origin}/api/analytics/events`, origin)).toBeNull()
    expect(sanitizeResourceUrl(`${origin}/rum/v1/default/rum?o2-api-key=abc`, origin)).toBeNull()
    expect(sanitizeResourceUrl(`${origin}/health`, origin)).toBeNull()
    expect(sanitizeResourceUrl(`${origin}/ready`, origin)).toBeNull()
  })

  it('drops cross-origin, credentialed, non-http, and unknown dynamic URLs', () => {
    const origin = 'http://localhost:4321'
    expect(sanitizeResourceUrl('https://cdn.example.com/app.js', origin)).toBeNull()
    expect(
      sanitizeResourceUrl('https://bucket.s3.amazonaws.com/uploads/a.jpg?X-Amz-Signature=secret', origin),
    ).toBeNull()
    expect(sanitizeResourceUrl('https://user:pass@localhost:4321/assets/a.js', origin)).toBeNull()
    expect(sanitizeResourceUrl('data:text/plain,hello', origin)).toBeNull()
    expect(sanitizeResourceUrl('blob:http://localhost:4321/uuid', origin)).toBeNull()
    expect(sanitizeResourceUrl(`${origin}/a/b/c/d`, origin)).toBeNull()
    expect(sanitizeResourceUrl(`${origin}/_hidden/a`, origin)).toBeNull()
    expect(sanitizeResourceUrl('not a url', origin)).toBeNull()
  })

  it('rejects DEV module impostors: /@fs, filesystem roots, source maps, and encoded traversal', () => {
    const origin = 'http://localhost:4321'
    for (const path of [
      '/@fs/Users/example/project/src/root.tsx',
      '/@fs/etc/passwd',
      '/Users/example/project/src/root.tsx',
      '/etc/passwd',
      '/src/%2e%2e/secret.ts',
      '/src/%2Fetc/passwd.ts',
      '/src/secret%20file.tsx',
      '/src/styles/public.css.map',
      '/src/root',
      '/src/',
      '/node_modules/other-package/dist/index.js',
      '/node_modules/.vite/deps/../../secret.js',
      '/node_modules/.vite/deps/react.js/extra',
      '/node_modules/.vite/deps/react.js.map',
      '/@vite/client/extra',
      '/@id/__x00__virtual',
      '/src/root.tsx/../../secret.ts',
    ]) {
      expect(sanitizeResourceUrl(`${origin}${path}`, origin)).toBeNull()
    }
  })

  it('rejects malformed oRPC procedure paths while accepting nested identifiers', () => {
    const origin = 'http://localhost:4321'
    for (const path of [
      '/rpc',
      '/rpc/content',
      '/rpc/content/',
      '/rpc//home',
      '/rpc/content/home/',
      '/rpc/content%2Fhome',
      '/rpc/content/home%20x',
      '/rpc/content/secret-slug',
      '/rpc/123/home',
      '/rpc/content.home/',
      '/rpc/content.posts/bySlug',
      '/rpc/content/home/secret/slug/extra/more/than/max/allowed',
    ]) {
      expect(sanitizeResourceUrl(`${origin}${path}`, origin)).toBeNull()
    }

    expect(sanitizeResourceUrl(`${origin}/rpc/content/home`, origin)).toBe('/rpc/content.home')
    expect(sanitizeResourceUrl(`${origin}/rpc/admin/posts/mySummary`, origin)).toBe('/rpc/admin.posts.mySummary')
    expect(sanitizeResourceUrl(`${origin}/rpc/content.home`, origin)).toBe('/rpc/content.home')
  })
})
