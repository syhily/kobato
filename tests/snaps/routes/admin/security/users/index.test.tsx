import { describe, expect, it } from 'vitest'

import { renderInRouter, stableHtml } from '#/_helpers/render'
import UsersRoute from '@/routes/admin/security/users/index'

describe('snapshot: routes/admin/security/users/index', () => {
  it('renders the users index route', () => {
    const html = stableHtml(renderInRouter(<UsersRoute />, '/admin/security/users'))
    // List-page chrome: heading, search box, and the invite button. These
    // fail if SSR degrades into an error boundary.
    expect(html).toContain('用户管理')
    expect(html).toContain('placeholder="搜索用户名或邮箱"')
    expect(html).toContain('邀请作者')
  })
})
