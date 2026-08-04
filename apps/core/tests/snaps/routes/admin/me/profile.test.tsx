import { renderInRouter, stableHtml } from '#/_helpers/render'
import { asRoute } from '#/_helpers/route-test-utils'

import { describe, expect, it } from 'vitest'

import MyProfileRoute from '@/routes/admin/me/profile'

describe('snapshot: routes/admin/me/profile', () => {
  it('renders the my profile route', () => {
    const Route = asRoute(MyProfileRoute)
    const html = stableHtml(
      renderInRouter(
        <Route
          loaderData={{
            user: {
              id: '1',
              name: 'Alice',
              email: 'alice@example.com',
              link: '',
              role: 'admin',
              badgeName: '',
              badgeColor: '',
              createdAt: '2024-01-01T00:00:00.000Z',
              lastIp: null,
              lastUa: null,
              loginMethod: 'password',
            },
            counts: { total: 0, pending: 0, deleted: 0, deleteRequested: 0 },
            passkeyEnabled: false,
            mailReady: false,
          }}
        />,
        '/admin/me/profile',
      ),
    )
    expect(html).toContain('个人信息')
    expect(html).toContain('Alice')
    expect(html).toContain('alice@example.com')
    expect(html).toContain('管理员')
    expect(html).toContain('统计信息')
  })
})
