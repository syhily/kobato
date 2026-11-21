import type { AdminUserDto } from '@kobato/contracts/users'

import { UserDetailView } from '@kobato/web-admin/ui/users/UserDetailView'
import { UserOperationsCard } from '@kobato/web-admin/ui/users/UserOperationsCard'
import { renderInRouter, renderToHtml, stableHtml, testQueryClient } from '@kobato/web-client/tests/utils/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'

function makeAdminUser(overrides: Partial<AdminUserDto> = {}): AdminUserDto {
  const id = overrides.id ?? `user-${Math.random().toString(36).slice(2, 8)}`
  const pick = <K extends keyof AdminUserDto>(key: K, fallback: AdminUserDto[K]): AdminUserDto[K] =>
    key in overrides ? (overrides[key] as AdminUserDto[K]) : fallback
  return {
    id,
    name: pick('name', 'User'),
    email: pick('email', `${id}@example.com`),
    link: pick('link', null),
    badgeName: pick('badgeName', null),
    badgeColor: pick('badgeColor', null),
    badgeTextColor: pick('badgeTextColor', null),
    role: pick('role', 'author'),
    isMuted: pick('isMuted', false),
    emailVerified: pick('emailVerified', true),
    createdAt: pick('createdAt', '2024-01-01T00:00:00.000Z'),
    deletedAt: pick('deletedAt', null),
    commentCount: pick('commentCount', 0),
    pendingCount: pick('pendingCount', 0),
    lastCommentAt: pick('lastCommentAt', null),
    passkeyCount: pick('passkeyCount', 0),
    loginMethod: pick('loginMethod', 'password'),
  }
}

function renderOpsCard(user: AdminUserDto, currentUserId = 'self-1', passkeyEnabled = false) {
  return stableHtml(
    renderToHtml(
      <UserOperationsCard
        user={user}
        currentUserId={currentUserId}
        passkeyEnabled={passkeyEnabled}
        onDeleted={vi.fn()}
      />,
    ),
  )
}

describe('snapshot: UserOperationsCard', () => {
  it('renders the restore button and hides delete for a soft-deleted user', () => {
    const user = makeAdminUser({
      id: 'deleted-1',
      name: 'Deleted Dan',
      role: 'author',
      deletedAt: '2024-03-01T00:00:00.000Z',
      commentCount: 3,
    })
    const html = renderOpsCard(user)
    expect(html).toContain('恢复用户')
    expect(html).not.toContain('软删除用户')
    expect(html).not.toContain('通过全部待审')
  })

  it('renders no role/reset/revoke/passkey controls for an anonymous user (role === null)', () => {
    const user = makeAdminUser({
      id: 'anon-1',
      name: 'Anon',
      role: null,
      pendingCount: 2,
    })
    const html = renderOpsCard(user)
    expect(html).toContain('操作')
    expect(html).not.toContain('发送重置邮件')
    expect(html).not.toContain('强制全部登出')
    expect(html).not.toContain('清除 Passkey')
    expect(html).toContain('通过全部待审')
  })

  it('hides the mute button for an admin user but shows reset/revoke', () => {
    const user = makeAdminUser({
      id: 'admin-1',
      name: 'Admin Ada',
      role: 'admin',
    })
    const html = renderOpsCard(user, 'self-1')
    expect(html).toContain('发送重置邮件')
    expect(html).toContain('强制全部登出')
    expect(html).not.toContain('禁言')
    expect(html).not.toContain('软删除用户')
  })

  it('shows the clear-passkey button only when passkeyEnabled and passkeyCount > 0', () => {
    const withPasskey = makeAdminUser({ id: 'pk-1', passkeyCount: 2, role: 'author' })
    const htmlWith = renderOpsCard(withPasskey, 'self-1', true)
    expect(htmlWith).toContain('清除 Passkey')
    expect(htmlWith).toMatch(/清除 Passkey \(2\)/u)

    const htmlDisabled = renderOpsCard(withPasskey, 'self-1', false)
    expect(htmlDisabled).not.toContain('清除 Passkey')

    const noPasskey = makeAdminUser({ id: 'pk-2', passkeyCount: 0, role: 'author' })
    const htmlZero = renderOpsCard(noPasskey, 'self-1', true)
    expect(htmlZero).not.toContain('清除 Passkey')
  })

  it('shows "解除禁言" for a muted non-admin user', () => {
    const user = makeAdminUser({ id: 'muted-1', role: 'visitor', isMuted: true })
    const html = renderOpsCard(user)
    expect(html).toContain('解除禁言')
    expect(html).toContain('lucide-volume-2')
    expect(html).not.toContain('lucide-volume-off')
  })

  it('shows the bulk-delete-comments button when commentCount > 0 and not admin', () => {
    const user = makeAdminUser({ id: 'c-1', role: 'author', commentCount: 7 })
    const html = renderOpsCard(user)
    expect(html).toContain('删除其全部评论')
  })

  it('hides the role select when viewing your own user card', () => {
    const user = makeAdminUser({ id: 'self-1', role: 'author' })
    const html = renderOpsCard(user, 'self-1')
    expect(html).not.toContain('角色')
  })

  it('shows the role select for another user with a non-null role', () => {
    const user = makeAdminUser({ id: 'other-1', role: 'author' })
    const html = renderOpsCard(user, 'self-1')
    expect(html).toContain('角色')
    expect(html).toContain('data-slot="select-trigger"')
    expect(html).toContain('data-slot="select-value">作者</span>')
  })
})

const { orpcQuery } = await import('@kobato/web-client/api/orpc-query')

describe('snapshot: UserDetailView', () => {
  beforeEach(() => {
    testQueryClient.clear()
  })

  it('renders the skeleton when the user query is pending', () => {
    const html = stableHtml(
      renderInRouter(
        <UserDetailView userId="u1" currentUserId="admin-1" navigate={vi.fn()} passkeyEnabled={false} />,
        '/admin/security/users/u1',
      ),
    )
    expect(html).toContain('skeleton')
  })

  it('renders the detail body, badges and stats when the user resolves', () => {
    const user = makeAdminUser({
      id: 'detail-1',
      name: 'Detail Diana',
      email: 'diana@example.com',
      role: 'author',
      commentCount: 12,
      pendingCount: 3,
      lastCommentAt: '2024-05-01T10:00:00.000Z',
      badgeName: 'VIP',
      badgeColor: '#ff0000',
    })
    testQueryClient.setQueryData(orpcQuery.admin.users.get.queryOptions({ input: { id: 'detail-1' } }).queryKey, {
      user,
    })
    testQueryClient.setQueryData(
      orpcQuery.admin.comments.loadAll.queryOptions({ input: { offset: 0, limit: 10, userId: 'detail-1' } }).queryKey,
      { comments: [] },
    )
    const html = stableHtml(
      renderInRouter(
        <UserDetailView userId="detail-1" currentUserId="admin-1" navigate={vi.fn()} passkeyEnabled={false} />,
        '/admin/security/users/detail-1',
      ),
    )
    expect(html).toContain('用户详情')
    expect(html).toContain('Detail Diana')
    expect(html).toContain('diana@example.com')
    expect(html).toContain('作者')
    expect(html).toContain('data-slot="select-trigger"')
    expect(html).toContain('正常')
    expect(html).toContain('VIP')
    expect(html).toContain('统计信息')
    expect(html).toContain('评论总数')
    expect(html).toContain('12')
    expect(html).toContain('待审核')
    expect(html).toContain('3')
    expect(html).toContain('该用户暂无评论。')
    expect(html).toContain('aria-label="返回用户列表"')
  })

  it('hides the role editor when the admin views their own detail', () => {
    const user = makeAdminUser({
      id: 'self-1',
      name: 'Self Admin',
      role: 'admin',
    })
    testQueryClient.setQueryData(orpcQuery.admin.users.get.queryOptions({ input: { id: 'self-1' } }).queryKey, { user })
    testQueryClient.setQueryData(
      orpcQuery.admin.comments.loadAll.queryOptions({ input: { offset: 0, limit: 10, userId: 'self-1' } }).queryKey,
      { comments: [] },
    )
    const html = stableHtml(
      renderInRouter(
        <UserDetailView userId="self-1" currentUserId="self-1" navigate={vi.fn()} passkeyEnabled={false} />,
        '/admin/security/users/self-1',
      ),
    )
    expect(html).toContain('Self Admin')
    expect(html).not.toContain('data-slot="select-trigger"')
  })

  it('renders the deleted + muted badges for a muted deleted user', () => {
    const user = makeAdminUser({
      id: 'dm-1',
      name: 'Mute Del',
      role: 'visitor',
      isMuted: true,
      deletedAt: '2024-04-01T00:00:00.000Z',
    })
    testQueryClient.setQueryData(orpcQuery.admin.users.get.queryOptions({ input: { id: 'dm-1' } }).queryKey, { user })
    testQueryClient.setQueryData(
      orpcQuery.admin.comments.loadAll.queryOptions({ input: { offset: 0, limit: 10, userId: 'dm-1' } }).queryKey,
      { comments: [] },
    )
    const html = stableHtml(
      renderInRouter(
        <UserDetailView userId="dm-1" currentUserId="admin-1" navigate={vi.fn()} passkeyEnabled={false} />,
        '/admin/security/users/dm-1',
      ),
    )
    expect(html).toContain('已删除')
    expect(html).not.toContain('已禁言')
    expect(html).toContain('恢复用户')
  })

  it('renders the anonymous badge and passkey count when passkeyEnabled', () => {
    const user = makeAdminUser({
      id: 'anon-det-1',
      name: 'Ghost',
      role: null,
      passkeyCount: 4,
    })
    testQueryClient.setQueryData(orpcQuery.admin.users.get.queryOptions({ input: { id: 'anon-det-1' } }).queryKey, {
      user,
    })
    testQueryClient.setQueryData(
      orpcQuery.admin.comments.loadAll.queryOptions({ input: { offset: 0, limit: 10, userId: 'anon-det-1' } }).queryKey,
      { comments: [] },
    )
    const html = stableHtml(
      renderInRouter(
        <UserDetailView userId="anon-det-1" currentUserId="admin-1" navigate={vi.fn()} passkeyEnabled={true} />,
        '/admin/security/users/anon-det-1',
      ),
    )
    expect(html).toContain('匿名')
    expect(html).toContain('Passkey')
    expect(html).toContain('4')
  })
})
