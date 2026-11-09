import { describe, expect, it } from 'vitest'

import { rumRouteContextFromMatches } from '@/client/lib/rum-route'

describe('rumRouteContextFromMatches', () => {
  it('names a public post detail by route id and template, never the slug', () => {
    expect(
      rumRouteContextFromMatches([
        { id: 'root', pathname: '/', params: {} },
        { id: 'routes/public/layout', pathname: '/', params: {} },
        { id: 'routes/public/post/detail', pathname: '/posts/secret-slug', params: { slug: 'secret-slug' } },
      ]),
    ).toEqual({ id: 'routes/public/post/detail', template: '/posts/:slug' })
  })

  it('keeps a static public route untouched', () => {
    expect(
      rumRouteContextFromMatches([
        { id: 'root', pathname: '/' },
        { id: 'routes/public/archives', pathname: '/archives' },
      ]),
    ).toEqual({ id: 'routes/public/archives', template: '/archives' })
  })

  it('folds a page-detail single segment into :slug', () => {
    expect(
      rumRouteContextFromMatches([
        { id: 'routes/public/page/detail', pathname: '/about-me', params: { slug: 'about-me' } },
      ]),
    ).toEqual({ id: 'routes/public/page/detail', template: '/:slug' })
  })

  it('handles a decoded search keyword and pagination', () => {
    expect(
      rumRouteContextFromMatches([
        {
          id: 'routes/public/search/list',
          pathname: '/search/%E4%B8%AD%E6%96%87/page/2',
          params: { keyword: '中文', num: '2' },
        },
      ]),
    ).toEqual({ id: 'routes/public/search/list', template: '/search/:keyword/page/:num' })
  })

  it('handles admin and editor routes with numeric ids', () => {
    expect(
      rumRouteContextFromMatches([
        { id: 'routes/admin/layout', pathname: '/admin/posts/42/analytics', params: {} },
        {
          id: 'routes/admin/posts/analytics',
          pathname: '/admin/posts/42/analytics',
          params: { postId: '42' },
        },
      ]),
    ).toEqual({ id: 'routes/admin/posts/analytics', template: '/admin/posts/:postId/analytics' })

    expect(
      rumRouteContextFromMatches([
        { id: 'routes/editor/layout', pathname: '/editor/post/7', params: {} },
        { id: 'routes/editor/post/edit', pathname: '/editor/post/7', params: { id: '7' } },
      ]),
    ).toEqual({ id: 'routes/editor/post/edit', template: '/editor/post/:id' })
  })

  it('uses the deepest match and lets its params shadow an ancestor value', () => {
    expect(
      rumRouteContextFromMatches([
        { id: 'routes/admin/layout', pathname: '/admin/library/music/music', params: { id: 'music' } },
        {
          id: 'routes/admin/library/music/detail',
          pathname: '/admin/library/music/music',
          params: { id: 'music' },
        },
      ]),
    ).toEqual({ id: 'routes/admin/library/music/detail', template: '/admin/library/music/:id' })
  })

  it('collapses a splat route tail into :*', () => {
    expect(
      rumRouteContextFromMatches([
        {
          id: 'routes/public/not-found',
          pathname: '/wp-content/plugins/x.php',
          params: { '*': 'wp-content/plugins/x.php' },
        },
      ]),
    ).toEqual({ id: 'routes/public/not-found', template: '/:*' })
  })

  it('falls back to a fixed unknown identity when no match/id is usable', () => {
    expect(rumRouteContextFromMatches([])).toEqual({ id: 'unknown', template: '/unknown' })
    expect(rumRouteContextFromMatches([{ pathname: '/' }])).toEqual({ id: 'unknown', template: '/' })
    expect(
      rumRouteContextFromMatches([{ id: '../escape', pathname: '/secret-slug', params: { slug: 'secret-slug' } }]),
    ).toEqual({ id: 'unknown', template: '/:slug' })
  })

  it('never emits a raw param value that missed its segment replacement', () => {
    const context = rumRouteContextFromMatches([
      { id: 'routes/public/post/detail', pathname: '/posts/a%2Fb', params: { slug: 'a/b' } },
    ])
    // The value spans a segment boundary, so the template falls back instead
    // of leaking it.
    expect(context.id).toBe('routes/public/post/detail')
    expect(context.template).not.toContain('a/b')
    expect(context.template).not.toContain('a%2Fb')
  })
})
