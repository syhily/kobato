import TagsRoute from '@kobato/web-admin/routes/admin/taxonomy/tags'
import { renderInRouter, stableHtml } from '@kobato/web-kit/tests/utils/render'
import { describe, expect, it } from 'vitest'

describe('snapshot: routes/admin/taxonomy/tags', () => {
  it('renders the tags route', () => {
    const html = stableHtml(renderInRouter(<TagsRoute />, '/admin/taxonomy/tags'))
    expect(html).toContain('标签管理')
    expect(html).toContain('aria-label="搜索标签"')
    expect(html).toContain('新增标签')
    expect(html).toContain('Slug')
  })
})
