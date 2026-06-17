import { describe, expect, it } from 'vitest'

import { renderInRouter, stableHtml } from '#/_helpers/render'
import PageNewRoute from '@/routes/editor/page/new'

describe('snapshot: routes/editor/page/new', () => {
  it('renders the new page editor route', () => {
    const html = stableHtml(renderInRouter(<PageNewRoute />, '/editor/page/new'))
    expect(html.length).toBeGreaterThan(0)
  })
})
