import { renderInRouter, stableHtml } from '#/_helpers/render'

import { describe, expect, it } from 'vitest'

import MusicAddRoute from '@/routes/admin/library/music/add'

describe('snapshot: routes/admin/library/music/add', () => {
  it('renders the add music route', () => {
    const html = stableHtml(renderInRouter(<MusicAddRoute />, '/admin/library/music/add'))
    // Add-view chrome: hero title, search box, and the idle search hint.
    // These fail if SSR degrades into an error boundary.
    expect(html).toContain('添加音乐')
    expect(html).toContain('aria-label="搜索音乐"')
    expect(html).toContain('输入关键词搜索音乐')
  })
})
