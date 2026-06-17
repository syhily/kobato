import { describe, expect, it } from 'vitest'

import { renderInRouter, stableHtml } from '#/_helpers/render'
import PostNewRoute from '@/routes/editor/post/new'

describe('snapshot: routes/editor/post/new', () => {
  it('renders the new post editor route', () => {
    const html = stableHtml(renderInRouter(<PostNewRoute />, '/editor/post/new'))
    expect(html.length).toBeGreaterThan(0)
  })
})
