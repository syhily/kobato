import { describe, expect, it } from 'vitest'

import { renderInRouter, stableHtml } from '#/_helpers/render'
import { asRoute } from '#/_helpers/route-test-utils'
import MusicDetailRoute from '@/routes/admin/library/music/detail'

describe('snapshot: routes/admin/library/music/detail', () => {
  it('renders the music detail route', () => {
    const Route = asRoute(MusicDetailRoute)
    const html = stableHtml(
      renderInRouter(<Route loaderData={{ id: 'abc' }} params={{ id: 'abc' }} />, '/admin/library/music/abc'),
    )
    // Pending detail query → DetailSkeleton, not the not-found/error states.
    expect(html).toContain('animate-pulse')
    expect(html).not.toContain('未找到该歌曲')
    expect(html).not.toContain('加载失败')
  })
})
