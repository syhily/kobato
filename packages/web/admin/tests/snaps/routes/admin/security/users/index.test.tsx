import UsersRoute from '@kobato/web-admin/routes/admin/security/users/index'
import { renderInRouter, stableHtml } from '@kobato/web-kit/tests/utils/render'
import { describe, expect, it } from 'vitest'

describe('snapshot: routes/admin/security/users/index', () => {
  it('renders the users index route', () => {
    const html = stableHtml(renderInRouter(<UsersRoute />, '/admin/security/users'))
    expect(html).toContain('用户管理')
    expect(html).toContain('placeholder="搜索用户名或邮箱"')
    expect(html).toContain('邀请作者')
  })
})
