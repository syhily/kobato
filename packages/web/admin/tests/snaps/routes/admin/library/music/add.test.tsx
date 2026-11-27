import MusicAddRoute from '@kobato/web-admin/routes/admin/library/music/add'
import { renderInRouter, stableHtml } from '@kobato/web-kit/tests/utils/render'
import { describe, expect, it } from 'vitest'

describe('snapshot: routes/admin/library/music/add', () => {
  it('renders the add music route', () => {
    const html = stableHtml(renderInRouter(<MusicAddRoute />, '/admin/library/music/add'))
    expect(html).toContain('添加音乐')
    expect(html).toContain('aria-label="搜索音乐"')
    expect(html).toContain('输入关键词搜索音乐')
  })
})
