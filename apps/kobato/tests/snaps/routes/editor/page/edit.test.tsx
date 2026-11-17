import { renderInRouter, stableHtml } from '@kobato/test-helpers/render.tsx'
import { asRoute } from '@kobato/test-helpers/route-test-utils.tsx'
import { describe, expect, it } from 'vitest'

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
