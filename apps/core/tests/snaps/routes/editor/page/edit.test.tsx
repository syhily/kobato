import { renderInRouter, stableHtml } from '#/_helpers/render'
import { asRoute } from '#/_helpers/route-test-utils'

import { describe, expect, it } from 'vitest'

import PageEditRoute from '@/routes/editor/page/edit'

describe('snapshot: routes/editor/page/edit', () => {
  it('renders the edit page editor route', () => {
    const Route = asRoute(PageEditRoute)
    const html = stableHtml(renderInRouter(<Route loaderData={null} params={{ id: '3' }} />, '/editor/page/3'))
    // The detail query stays pending under SSR, so the route renders its
    // EditorRouteSkeleton — and not the EditorRouteError state. Both
    // assertions fail if SSR degrades into an error boundary.
    expect(html).toContain('data-slot="skeleton"')
    expect(html).not.toContain('无法打开页面编辑器')
  })
})
