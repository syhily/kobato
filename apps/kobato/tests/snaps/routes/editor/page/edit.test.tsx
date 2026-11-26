import { asRoute } from '@kobato/test/route-test-utils'
import { renderInRouter, stableHtml } from '@kobato/web-kit/tests/utils/render'
import { describe, expect, it } from 'vitest'

import PageEditRoute from '@/routes/editor/page/edit'

describe('snapshot: routes/editor/page/edit', () => {
  it('renders the edit page editor route', () => {
    const Route = asRoute(PageEditRoute)
    const html = stableHtml(renderInRouter(<Route loaderData={null} params={{ id: '3' }} />, '/editor/page/3'))
    expect(html).toContain('data-slot="skeleton"')
    expect(html).not.toContain('无法打开页面编辑器')
  })
})
