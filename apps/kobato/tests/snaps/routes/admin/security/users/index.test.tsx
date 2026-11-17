import { renderInRouter, stableHtml } from '@kobato/test/render.tsx'
import { describe, expect, it } from 'vitest'

import UsersRoute from '@/routes/admin/security/users/index.tsx'

describe('snapshot: routes/admin/security/users/index', () => {
  it('renders the users index route', () => {
    const html = stableHtml(renderInRouter(<UsersRoute />, '/admin/security/users'))
    // List-page chrome — fails if SSR degrades into an error boundary.
    expect(html).toContain('用户管理')
    expect(html).toContain('placeholder="搜索用户名或邮箱"')
    expect(html).toContain('邀请作者')
  })
})
