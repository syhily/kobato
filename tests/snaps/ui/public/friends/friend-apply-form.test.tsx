import { describe, expect, it } from 'vitest'

import { renderToHtml, stableHtml } from '#/_helpers/render'
import { FriendApplyForm } from '@/ui/public/friends/FriendApplyForm'

describe('snapshot: FriendApplyForm', () => {
  it('renders only the Ghost-style trigger button; the form stays inside the dialog', () => {
    const html = stableHtml(renderToHtml(<FriendApplyForm />))
    expect(html).toContain('申请友链')
    // No form markup leaks onto the page — fields live behind the dialog.
    expect(html).not.toContain('站名')
    expect(html).not.toContain('主页 URL')
    expect(html).not.toContain('提交申请')
    expect(html).not.toContain('name="contact"')
  })
})
