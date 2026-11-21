import { renderInRouter, stableHtml } from '@kobato/web-client/tests/utils/render'
import { describe, expect, it } from 'vitest'

import ImagesRoute from '@/routes/admin/library/images'

describe('snapshot: routes/admin/library/images', () => {
  it('renders the images route', () => {
    const html = stableHtml(renderInRouter(<ImagesRoute />, '/admin/library/images'))
    expect(html).toContain('图片管理')
    expect(html).toContain('上传图片')
  })
})
