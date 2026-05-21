import { type RouteConfig, index, layout, route } from '@react-router/dev/routes'

// See `src/routes/README.md` for the rationale behind every block.
export default [
  // Public layout — see README.md §A (and §B for the splat).
  layout('routes/public/layout.tsx', [
    index('routes/public/home.tsx'),
    route('page/:num', 'routes/public/home.tsx', { id: 'home-page' }),
    route('archives', 'routes/public/archives.tsx'),
    route('categories', 'routes/public/categories.tsx'),
    route('cats/:slug', 'routes/public/category/list.tsx'),
    route('cats/:slug/page/:num', 'routes/public/category/list.tsx', { id: 'category-list-page' }),
    route('tags/:slug', 'routes/public/tag/list.tsx'),
    route('tags/:slug/page/:num', 'routes/public/tag/list.tsx', { id: 'tag-list-page' }),
    route('search/:keyword', 'routes/public/search/list.tsx'),
    route('search/:keyword/page/:num', 'routes/public/search/list.tsx', { id: 'search-list-page' }),
    route('posts/:slug', 'routes/public/post/detail.tsx'),
    route(':slug', 'routes/public/page/detail.tsx'),
    // Splat MUST stay last — see README.md §B.
    route('*', 'routes/public/not-found.tsx'),
  ]),

  // Auth split-screen layout — see README.md §F.
  layout('routes/auth/layout.tsx', [
    route('admin/signin', 'routes/auth/signin.tsx'),
    route('admin/setup', 'routes/auth/setup/index.tsx'),
  ]),
  // Editor shell — standalone layout for immersive editing.
  layout('routes/editor/layout.tsx', [
    route('editor/post/new', 'routes/editor/post/new.tsx'),
    route('editor/post/:id', 'routes/editor/post/edit.tsx'),
    route('editor/post/:id/analytics', 'routes/editor/post/analytics.tsx'),
    route('editor/page/new', 'routes/editor/page/new.tsx'),
    route('editor/page/:id', 'routes/editor/page/edit.tsx'),
  ]),
  // Admin SPA shell — see README.md §G.
  layout('routes/admin/layout.tsx', [
    route('admin', 'routes/admin/dashboard.tsx'),
    route('admin/posts', 'routes/admin/posts/index.tsx'),
    route('admin/posts/:postId/analytics', 'routes/admin/posts/analytics.tsx'),
    route('admin/pages', 'routes/admin/pages/index.tsx'),
    route('admin/comments', 'routes/admin/comments.tsx'),
    route('admin/categories', 'routes/admin/categories.tsx'),
    route('admin/tags', 'routes/admin/tags.tsx'),
    route('admin/friends', 'routes/admin/friends.tsx'),
    route('admin/library/images', 'routes/admin/library/images.tsx'),
    route('admin/library/music', 'routes/admin/library/music.tsx'),
    route('admin/users', 'routes/admin/users/index.tsx'),
    route('admin/users/:id', 'routes/admin/users/detail.tsx'),
    route('admin/me/profile', 'routes/admin/me/profile.tsx'),
    route('admin/me/comments', 'routes/admin/me/comments.tsx'),
    route('admin/me/sessions', 'routes/admin/me/sessions.tsx'),
    route('admin/security/sessions', 'routes/admin/security/sessions.tsx'),
    route('admin/security/audit-log', 'routes/admin/security/audit-log.tsx'),
    route('admin/analytics', 'routes/admin/analytics/layout.tsx', [
      index('routes/admin/analytics/overview.tsx'),
      route('realtime', 'routes/admin/analytics/realtime.tsx'),
      route('mentions', 'routes/admin/analytics/mentions.tsx'),
    ]),
    // Settings single-page panel — see README.md §H.
    layout('routes/admin/settings/layout.tsx', [route('admin/settings', 'routes/admin/settings/index.tsx')]),
  ]),
] satisfies RouteConfig
