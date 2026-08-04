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
] satisfies RouteConfig
