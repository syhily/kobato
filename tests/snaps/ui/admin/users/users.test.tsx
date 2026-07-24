import { describe, expect, it } from 'vitest'

import type { AdminUserDto } from '@/shared/contracts/users'

import { TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'
import { renderInRouter, renderToHtml, stableHtml } from '#/_helpers/render'
import { InviteAuthorDialog } from '@/ui/admin/users/InviteAuthorDialog'
import { UsersTable } from '@/ui/admin/users/UsersTable'
import { UsersToolbar } from '@/ui/admin/users/UsersToolbar'
import { UsersView } from '@/ui/admin/users/UsersView'

function makeAdminUser(overrides: Partial<AdminUserDto> = {}): AdminUserDto {
  const id = overrides.id ?? `user-${Math.random().toString(36).slice(2, 8)}`
  return {
    id,
    name: overrides.name ?? 'User',
    email: overrides.email ?? `${id}@example.com`,
    link: overrides.link ?? null,
    badgeName: overrides.badgeName ?? null,
    badgeColor: overrides.badgeColor ?? null,
    badgeTextColor: overrides.badgeTextColor ?? null,
    role: overrides.role ?? 'author',
    isMuted: overrides.isMuted ?? false,
    emailVerified: overrides.emailVerified ?? true,
    createdAt: overrides.createdAt ?? '2024-01-01T00:00:00.000Z',
    deletedAt: overrides.deletedAt ?? null,
    commentCount: overrides.commentCount ?? 0,
    pendingCount: overrides.pendingCount ?? 0,
    lastCommentAt: overrides.lastCommentAt ?? null,
    passkeyCount: overrides.passkeyCount ?? 0,
    passkeyForce: overrides.passkeyForce ?? false,
  }
}

describe('snapshot: UsersView', () => {
  it('renders the loading state', () => {
    const html = stableHtml(renderInRouter(<UsersView />))
    expect(html).toContain('用户管理')
    expect(html).toContain('搜索用户名或邮箱')
    expect(html).toContain('邀请作者')
  })
})

describe('snapshot: UsersTable', () => {
  it('renders rows', () => {
    const rows = [
      makeAdminUser({
        id: 'user-1',
        name: 'Alice',
        email: 'alice@example.com',
        role: 'admin',
      }),
      makeAdminUser({
        id: 'user-2',
        name: 'Bob',
        email: 'bob@example.com',
        role: 'author',
        isMuted: true,
      }),
      makeAdminUser({
        id: 'user-3',
        name: 'Carol',
        email: 'carol@example.com',
        role: 'visitor',
        deletedAt: '2024-03-01T00:00:00.000Z',
      }),
    ]
    const html = stableHtml(
      renderInRouter(<UsersTable rows={rows} config={TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!} isLoading={false} />),
    )
    expect(html).toContain('Alice')
    expect(html).toContain('Bob')
    expect(html).toContain('Carol')
    expect(html).toContain('/admin/security/users/user-1')
    expect(html).toContain('已禁言')
    expect(html).toContain('已删除')
  })

  it('renders loading skeleton', () => {
    const html = stableHtml(
      renderInRouter(<UsersTable rows={[]} config={TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!} isLoading={true} />),
    )
    expect(html).toContain('skeleton')
  })

  it('renders empty state', () => {
    const html = stableHtml(
      renderInRouter(<UsersTable rows={[]} config={TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!} isLoading={false} />),
    )
    expect(html).toContain('未找到用户')
  })
})

describe('snapshot: UsersToolbar', () => {
  it('renders default state', () => {
    const html = stableHtml(
      renderInRouter(
        <UsersToolbar
          role="all"
          sortBy="recent"
          pageSize={20}
          includeDeleted={false}
          onRoleChange={() => {}}
          onSortByChange={() => {}}
          onPageSizeChange={() => {}}
          onIncludeDeletedChange={() => {}}
        />,
      ),
    )
    expect(html).toContain('筛选')
    expect(html).toContain('lucide-funnel')
  })

  it('renders active filter state', () => {
    const html = stableHtml(
      renderInRouter(
        <UsersToolbar
          role="admin"
          sortBy="commentCount"
          pageSize={20}
          includeDeleted={true}
          onRoleChange={() => {}}
          onSortByChange={() => {}}
          onPageSizeChange={() => {}}
          onIncludeDeletedChange={() => {}}
        />,
      ),
    )
    expect(html).toContain('筛选')
    expect(html).toContain('border-foreground/30')
    expect(html).toContain('bg-secondary')
  })
})

describe('snapshot: InviteAuthorDialog', () => {
  it('renders closed', () => {
    const html = stableHtml(renderToHtml(<InviteAuthorDialog open={false} onClose={() => {}} onInvited={() => {}} />))
    expect(html).toBe('')
  })
})
