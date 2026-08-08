import { renderToStaticMarkup } from 'react-dom/server'
import { createMemoryRouter, Outlet, RouterProvider, type RouteObject } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { Layout } from '@/root'

// Virtual module from the route-warmup Vite plugin — unresolvable in the unit runner.
vi.mock('virtual:route-warmup-script', () => ({ default: '' }))

// Meta/Links/Scripts/ScrollRestoration need the framework build manifest a
// memory router lacks — stub them, keep the rest real.
vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>()
  return {
    ...actual,
    Meta: () => null,
    Links: () => null,
    Scripts: () => null,
    ScrollRestoration: () => null,
  }
})

const fonts = {
  global: [{ family: 'Global Sans', href: 'https://site.test/fonts/embedded/aaaa/result.css' }],
  post: [{ family: 'Body Serif', href: 'https://site.test/fonts/embedded/bbbb/result.css' }],
  code: [{ family: 'Code Mono', href: 'https://site.test/fonts/embedded/cccc/result.css' }],
}

const rootData = {
  theme: null,
  fonts,
  blogSettings: { assets: null, siteIdentity: { locale: 'zh-CN' } },
  criticalLinks: [],
  tier2Chunks: [],
  csrfToken: 'csrf',
  cspNonce: 'nonce',
}

function renderLayout(initialPath: string, loaderData: unknown): string {
  const routes: RouteObject[] = [
    {
      id: 'root',
      Component: () => (
        <Layout>
          <Outlet />
        </Layout>
      ),
      children: [
        { path: '/', Component: () => <div>home</div> },
        { path: '/posts/x', handle: { postFonts: true }, Component: () => <div>post</div> },
      ],
    },
  ]
  const router = createMemoryRouter(routes, {
    initialEntries: [initialPath],
    hydrationData: { loaderData: { root: loaderData } },
  })
  return renderToStaticMarkup(<RouterProvider router={router} />)
}

describe('root Layout font slots', () => {
  it('renders every slot link and the --font-serif override on handle.postFonts routes', () => {
    const html = renderLayout('/posts/x', rootData)

    // One self-hosted stylesheet link per configured font.
    expect(html).toContain('/fonts/embedded/aaaa/result.css')
    expect(html).toContain('/fonts/embedded/bbbb/result.css')
    expect(html).toContain('/fonts/embedded/cccc/result.css')

    // Slot families are prepended to the CSS token stacks on <html>.
    expect(html).toContain('--font-body')
    expect(html).toContain('Global Sans')
    expect(html).toContain('--font-serif')
    expect(html).toContain('Body Serif')
    expect(html).toContain('--font-code')
    expect(html).toContain('Code Mono')
  })

  it('renders only the global slot on routes without handle.postFonts', () => {
    const html = renderLayout('/', rootData)

    expect(html).toContain('/fonts/embedded/aaaa/result.css')
    expect(html).not.toContain('/fonts/embedded/bbbb/result.css')
    expect(html).not.toContain('/fonts/embedded/cccc/result.css')

    expect(html).toContain('--font-body')
    expect(html).not.toContain('--font-serif')
    expect(html).not.toContain('--font-code')
  })

  it('emits no font markup when no fonts are configured', () => {
    const html = renderLayout('/posts/x', { ...rootData, fonts: null })

    expect(html).not.toContain('/fonts/embedded/')
    expect(html).not.toContain('--font-serif')
  })
})
