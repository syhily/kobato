import type { AdminUserDto } from '@kobato/shared/contracts/users'

import { mockTanstackQuery } from '#/_helpers/mock-react-query'
import { renderInRouter, renderToHtml, stableHtml } from '#/_helpers/render'

import { UserDetailView } from '@kobato/ui/admin/users/UserDetailView'
import { UserEditForm } from '@kobato/ui/admin/users/UserEditForm'
import { UserOperationsCard } from '@kobato/ui/admin/users/UserOperationsCard'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const queryMocks = mockTanstackQuery()

queryMocks.mutation = { mutate: vi.fn(), isPending: false, error: null as { message: string } | null }

// The cards own their TanStack mutations now. Stub `useMutation` with a
// shared fixture so the update-error branch can be driven from the test.

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
    loginMethod: overrides.loginMethod ?? 'password',
  }
}

beforeEach(() => {
  queryMocks.mutation = { mutate: vi.fn(), isPending: false, error: null }
})

describe('snapshot: UserEditForm', () => {
  it('renders the form', () => {
    const user = makeAdminUser({
      id: 'user-1',
      name: 'Alice',
      email: 'alice@example.com',
      link: 'https://example.com',
      badgeName: 'VIP',
      badgeColor: '#ff0000',
      badgeTextColor: '#ffffff',
    })
    const html = stableHtml(renderToHtml(<UserEditForm user={user} />))
    expect(html).toContain('编辑信息')
    expect(html).toContain('Alice')
    expect(html).toContain('alice@example.com')
    expect(html).toContain('VIP')
    expect(html).toContain('保存')
  })

  it('renders with update error', () => {
    queryMocks.mutation = {
      mutate: vi.fn(),
      isPending: false,
      error: { message: '邮箱已被占用' },
    }
    const user = makeAdminUser({ id: 'user-1', name: 'Alice', email: 'alice@example.com' })
    const html = stableHtml(renderToHtml(<UserEditForm user={user} />))
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
        <UserOperationsCard user={user} currentUserId="user-1" passkeyEnabled={true} onDeleted={() => {}} />,
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
        <UserOperationsCard user={user} currentUserId="user-1" passkeyEnabled={false} onDeleted={() => {}} />,
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
        <UserOperationsCard user={user} currentUserId="user-1" passkeyEnabled={false} onDeleted={() => {}} />,
      ),
    )
    expect(html).toContain('解除禁言')
  })
})

describe('snapshot: UserDetailView', () => {
  it('renders skeleton while loading', () => {
    const html = stableHtml(
      renderInRouter(
        <UserDetailView userId="user-1" currentUserId="admin-1" navigate={vi.fn()} passkeyEnabled={false} />,
      ),
    )
    expect(html).toContain('skeleton')
  })
})
