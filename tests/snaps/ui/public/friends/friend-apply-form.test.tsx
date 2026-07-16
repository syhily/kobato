import { describe, expect, it } from 'vitest'

import { renderToHtml, stableHtml } from '#/_helpers/render'
import { FriendApplyForm } from '@/ui/public/friends/FriendApplyForm'

describe('snapshot: FriendApplyForm', () => {
  it('renders the application fields with the honeypot hidden off-screen', () => {
    const html = stableHtml(renderToHtml(<FriendApplyForm />))
    expect(html).toContain('申请友链')
    expect(html).toContain('站名')
    expect(html).toContain('主页 URL')
    expect(html).toContain('封面图 URL（可选）')
    expect(html).toContain('RSS URL（可选）')
    expect(html).toContain('提交申请')
    // Honeypot present but tucked away (name="contact", tabIndex -1).
    expect(html).toContain('name="contact"')
    expect(html).toContain('tabindex="-1"')
  })
})
