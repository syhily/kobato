import { renderInRouter, stableHtml } from '#/_helpers/render'

import { describe, expect, it } from 'vitest'

import TagsRoute from '@/routes/admin/taxonomy/tags'

describe('snapshot: routes/admin/taxonomy/tags', () => {
  it('renders the tags route', () => {
    const html = stableHtml(renderInRouter(<TagsRoute />, '/admin/taxonomy/tags'))
    // List-page chrome: heading, search box, create button, and the table
    // header (rendered even while rows are loading). These fail if SSR
    // degrades into an error boundary.
    expect(html).toContain('标签管理')
    expect(html).toContain('aria-label="搜索标签"')
    expect(html).toContain('新增标签')
    expect(html).toContain('Slug')
  })
})
