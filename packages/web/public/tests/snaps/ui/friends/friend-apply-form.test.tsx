import { renderToHtml, stableHtml } from '@kobato/web-kit/tests/utils/render'
import { FriendApplyForm } from '@kobato/web-public/ui/friends/FriendApplyForm'
import { describe, expect, it } from 'vitest'

describe('snapshot: FriendApplyForm', () => {
  it('renders only the Ghost-style trigger button; the form stays inside the dialog', () => {
    const html = stableHtml(renderToHtml(<FriendApplyForm />))
    expect(html).toContain('申请友链')
    expect(html).not.toContain('站名')
    expect(html).not.toContain('主页 URL')
    expect(html).not.toContain('提交申请')
    expect(html).not.toContain('name="contact"')
  })
})
