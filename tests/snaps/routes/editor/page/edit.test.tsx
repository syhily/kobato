import { describe, expect, it } from 'vitest'

import { renderInRouter, stableHtml } from '#/_helpers/render'
import { asRoute } from '#/_helpers/route-test-utils'
import PageEditRoute from '@/routes/editor/page/edit'

describe('snapshot: routes/editor/page/edit', () => {
  it('renders the edit page editor route', () => {
    const Route = asRoute(PageEditRoute)
    const html = stableHtml(renderInRouter(<Route loaderData={null} params={{ id: '3' }} />, '/editor/page/3'))
    // Pending detail query → EditorRouteSkeleton, not the error state.
    expect(html).toContain('data-slot="skeleton"')
    expect(html).not.toContain('无法打开页面编辑器')
  })
})
