import { renderInRouter, stableHtml } from '@kobato/web-kit/tests/utils/render'
import NotFoundRoute from '@sayaka/routes/not-found'
import { describe, expect, it } from 'vitest'

describe('snapshot: routes/public/not-found', () => {
  it('renders nothing for the default export', () => {
    const html = stableHtml(renderInRouter(<NotFoundRoute />, '/missing'))
    expect(html).toBe('')
  })
})
