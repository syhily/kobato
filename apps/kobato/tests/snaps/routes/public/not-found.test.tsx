import { renderInRouter, stableHtml } from '@kobato/test/render.tsx'
import { describe, expect, it } from 'vitest'

import NotFoundRoute from '@/routes/public/not-found.tsx'

describe('snapshot: routes/public/not-found', () => {
  it('renders nothing for the default export', () => {
    const html = stableHtml(renderInRouter(<NotFoundRoute />, '/missing'))
    expect(html).toBe('')
  })
})
