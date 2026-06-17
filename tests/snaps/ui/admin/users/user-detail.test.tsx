import { describe, expect, it, vi } from 'vitest'

import type { AdminUserDto } from '@/shared/types/users'

import { TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'
import { renderInRouter, renderToHtml, stableHtml } from '#/_helpers/render'
import { UserDetailView } from '@/ui/admin/users/UserDetailView'
import { UserEditForm } from '@/ui/admin/users/UserEditForm'
import { UserOperationsCard } from '@/ui/admin/users/UserOperationsCard'

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

const noopMutation = {
  isPending: false,
  error: null,
  mutate: () => {},
}

describe('snapshot: UserEditForm', () => {
  it('renders the form', () => {
    const html = stableHtml(
      renderToHtml(
        <UserEditForm
          name="Alice"
          setName={() => {}}
          email="alice@example.com"
          setEmail={() => {}}
          link="https://example.com"
          setLink={() => {}}
          badgeName="VIP"
          setBadgeName={() => {}}
          badgeColor="#ff0000"
          setBadgeColor={() => {}}
          useTextOverride={true}
          setUseTextOverride={() => {}}
          badgeTextColor="#ffffff"
          setBadgeTextColor={() => {}}
          updateMutation={noopMutation}
          userId="user-1"
        />,
      ),
    )
    expect(html).toContain('编辑信息')
    expect(html).toContain('Alice')
    expect(html).toContain('alice@example.com')
    expect(html).toContain('VIP')
    expect(html).toContain('保存')
  })

  it('renders with update error', () => {
    const html = stableHtml(
      renderToHtml(
        <UserEditForm
          name="Alice"
          setName={() => {}}
          email="alice@example.com"
          setEmail={() => {}}
          link=""
          setLink={() => {}}
          badgeName=""
          setBadgeName={() => {}}
          badgeColor="#008c95"
          setBadgeColor={() => {}}
          useTextOverride={false}
          setUseTextOverride={() => {}}
          badgeTextColor="#ffffff"
          setBadgeTextColor={() => {}}
          updateMutation={{
            isPending: false,
            error: { message: '邮箱已被占用' },
            mutate: () => {},
          }}
          userId="user-1"
        />,
      ),
    )
    expect(html).toContain('邮箱已被占用')
  })
})

describe('snapshot: UserOperationsCard', () => {
  it('renders operations for a normal author', () => {
    const user = makeAdminUser({
      id: 'user-2',
      name: 'Bob',
      role: 'author',
      commentCount: 5,
      pendingCount: 2,
      passkeyCount: 1,
    })
    const html = stableHtml(
      renderToHtml(
        <UserOperationsCard
          user={user}
          currentUserId="user-1"
          passkeyEnabled={true}
          roleDraft=""
          setRoleDraft={() => {}}
          setConfirm={() => {}}
          updateRoleMutation={noopMutation}
          sendResetMutation={noopMutation}
          revokeSessionsMutation={noopMutation}
          muteMutation={noopMutation}
          bulkApproveMutation={noopMutation}
          deleteMutation={noopMutation}
          restoreMutation={noopMutation}
          bulkDeleteMutation={noopMutation}
          clearPasskeysMutation={noopMutation}
        />,
      ),
    )
    expect(html).toContain('操作')
    expect(html).toContain('发送重置邮件')
    expect(html).toContain('强制全部登出')
    expect(html).toContain('清除 Passkey')
    expect(html).toContain('禁言')
    expect(html).toContain('通过全部待审')
    expect(html).toContain('软删除用户')
    expect(html).toContain('删除其全部评论')
  })

  it('renders operations for self admin', () => {
    const user = makeAdminUser({ id: 'user-1', name: 'Alice', role: 'admin' })
    const html = stableHtml(
      renderToHtml(
        <UserOperationsCard
          user={user}
          currentUserId="user-1"
          passkeyEnabled={false}
          roleDraft=""
          setRoleDraft={() => {}}
          setConfirm={() => {}}
          updateRoleMutation={noopMutation}
          sendResetMutation={noopMutation}
          revokeSessionsMutation={noopMutation}
          muteMutation={noopMutation}
          bulkApproveMutation={noopMutation}
          deleteMutation={noopMutation}
          restoreMutation={noopMutation}
          bulkDeleteMutation={noopMutation}
          clearPasskeysMutation={noopMutation}
        />,
      ),
    )
    expect(html).toContain('操作')
    expect(html).not.toContain('软删除用户')
    expect(html).not.toContain('删除其全部评论')
  })

  it('renders operations for a muted visitor', () => {
    const user = makeAdminUser({
      id: 'user-3',
      name: 'Carol',
      role: 'visitor',
      isMuted: true,
    })
    const html = stableHtml(
      renderToHtml(
        <UserOperationsCard
          user={user}
          currentUserId="user-1"
          passkeyEnabled={false}
          roleDraft=""
          setRoleDraft={() => {}}
          setConfirm={() => {}}
          updateRoleMutation={noopMutation}
          sendResetMutation={noopMutation}
          revokeSessionsMutation={noopMutation}
          muteMutation={noopMutation}
          bulkApproveMutation={noopMutation}
          deleteMutation={noopMutation}
          restoreMutation={noopMutation}
          bulkDeleteMutation={noopMutation}
          clearPasskeysMutation={noopMutation}
        />,
      ),
    )
    expect(html).toContain('解除禁言')
  })
})

describe('snapshot: UserDetailView', () => {
  it('renders skeleton while loading', () => {
    const html = stableHtml(
      renderInRouter(<UserDetailView userId="user-1" navigate={vi.fn()} passkeyEnabled={false} />),
    )
    expect(html).toContain('skeleton')
  })
})
