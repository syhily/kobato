import { describe, expect, it } from 'vitest'

import { renderInRouter, stableHtml } from '#/_helpers/render'
import ImagesRoute from '@/routes/admin/library/images'

describe('snapshot: routes/admin/library/images', () => {
  it('renders the images route', () => {
    const html = stableHtml(renderInRouter(<ImagesRoute />, '/admin/library/images'))
    // List-page chrome — fails if SSR degrades into an error boundary.
    expect(html).toContain('图片管理')
    expect(html).toContain('上传图片')
  })
})
