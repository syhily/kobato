import { renderInRouter, stableHtml } from '@kobato/web-public/tests/utils/render'
import { describe, expect, it } from 'vitest'

import MusicsRoute from '@/routes/admin/library/music'

describe('snapshot: routes/admin/library/music', () => {
  it('renders the music route', () => {
    const html = stableHtml(renderInRouter(<MusicsRoute />, '/admin/library/music'))
    expect(html).toContain('音乐库')
    expect(html).toContain('aria-label="添加音乐"')
    expect(html).toContain('aria-label="搜索歌曲"')
    expect(html).toContain('aria-label="排序"')
  })
})
