import { describe, expect, it } from 'vitest'

import { renderInRouter, stableHtml } from '#/_helpers/render'
import MusicsRoute from '@/routes/admin/library/music'

describe('snapshot: routes/admin/library/music', () => {
  it('renders the music route', () => {
    const html = stableHtml(renderInRouter(<MusicsRoute />, '/admin/library/music'))
    expect(html.length).toBeGreaterThan(0)
  })
})
