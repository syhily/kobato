import { describe, expect, it } from 'vitest'

import { renderInRouter, stableHtml } from '#/_helpers/render'
import MusicsRoute from '@/routes/admin/library/music'

describe('snapshot: routes/admin/library/music', () => {
  it('renders the music route', () => {
    const html = stableHtml(renderInRouter(<MusicsRoute />, '/admin/library/music'))
    // Library chrome: the hero title plus the add / search / sort controls.
    // These fail if SSR degrades into an error boundary.
    expect(html).toContain('音乐库')
    expect(html).toContain('aria-label="添加音乐"')
    expect(html).toContain('aria-label="搜索歌曲"')
    expect(html).toContain('aria-label="排序"')
  })
})
