import { describe, expect, it } from 'vitest'

import { renderInRouter, stableHtml } from '#/_helpers/render'
import TagsRoute from '@/routes/admin/taxonomy/tags'

describe('snapshot: routes/admin/taxonomy/tags', () => {
  it('renders the tags route', () => {
    const html = stableHtml(renderInRouter(<TagsRoute />, '/admin/taxonomy/tags'))
    expect(html.length).toBeGreaterThan(0)
  })
})
