import { renderInRouter, stableHtml } from '#/_helpers/render'

import { describe, expect, it } from 'vitest'

import NotFoundRoute from '@/routes/public/not-found'

describe('snapshot: routes/public/not-found', () => {
  it('renders nothing for the default export', () => {
    const html = stableHtml(renderInRouter(<NotFoundRoute />, '/missing'))
    expect(html).toBe('')
  })
})
