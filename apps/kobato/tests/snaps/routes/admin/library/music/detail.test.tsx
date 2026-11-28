import { asRoute } from '@kobato/test/route-test-utils'
import { renderInRouter, stableHtml } from '@kobato/web-kit/tests/utils/render'
import { describe, expect, it } from 'vitest'

import MusicDetailRoute from '@/routes/admin/library/music/detail'

describe('snapshot: routes/admin/library/music/detail', () => {
  it('renders the music detail route', () => {
    const Route = asRoute(MusicDetailRoute)
    const html = stableHtml(
      renderInRouter(<Route loaderData={{ id: 'abc' }} params={{ id: 'abc' }} />, '/admin/library/music/abc'),
    )
    expect(html).toContain('animate-pulse')
    expect(html).not.toContain('未找到该歌曲')
    expect(html).not.toContain('加载失败')
  })
})
