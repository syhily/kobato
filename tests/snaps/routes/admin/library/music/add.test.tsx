import { describe, expect, it } from 'vitest'

import { renderInRouter, stableHtml } from '#/_helpers/render'
import MusicAddRoute from '@/routes/admin/library/music/add'

describe('snapshot: routes/admin/library/music/add', () => {
  it('renders the add music route', () => {
    const html = stableHtml(renderInRouter(<MusicAddRoute />, '/admin/library/music/add'))
    expect(html.length).toBeGreaterThan(0)
  })
})
