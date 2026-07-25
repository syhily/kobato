import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AdminUserDto } from '@/shared/contracts/users'

import { renderInRouter, renderToHtml, stableHtml } from '#/_helpers/render'
import { UserDetailView } from '@/ui/admin/users/UserDetailView'
import { UserOperationsCard } from '@/ui/admin/users/UserOperationsCard'

// UserOperationsCard owns its mutations; every rendered button is gated on a
// combination of `user.role`, `user.deletedAt`, `user.isMuted`,
// `user.pendingCount`, `user.commentCount` and `user.passkeyCount`. We render
// one fixture per branch to hit every conditional. The existing
// user-detail.test.tsx covers author (full), self-admin (no delete) and
// muted-visitor; this file adds the deleted, anonymous, and passkey-edge
// branches plus a resolved-user UserDetailView.

function makeAdminUser(overrides: Partial<AdminUserDto> = {}): AdminUserDto {
  const id = overrides.id ?? `user-${Math.random().toString(36).slice(2, 8)}`
  // Use explicit key-presence checks so `null`, `false` and `0` overrides are
  // honoured (the `??` operator would replace them with defaults).
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
    passkeyForce: pick('passkeyForce', false),
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
    // Soft-delete branch swaps delete → restore; the destructive delete button is hidden.
    expect(html).not.toContain('软删除用户')
    // The mute button is gated on `role !== 'admin'` (not deletedAt), so it
    // still renders for a soft-deleted non-admin. We assert the restore swap
    // is the deleted-branch signal rather than mute absence.
    // No pending comments => no bulk-approve button.
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
    // role === null skips the role select, reset, revoke, passkey rows.
    expect(html).not.toContain('发送重置邮件')
    expect(html).not.toContain('强制全部登出')
    expect(html).not.toContain('清除 Passkey')
    // The mute button is gated on `role !== 'admin'` (null !== 'admin' is
    // true), so it still renders for an anonymous user.
    // pendingCount > 0 still shows the bulk-approve button even for anonymous.
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
    // Admin is exempt from mute + delete.
    expect(html).not.toContain('禁言')
    expect(html).not.toContain('软删除用户')
  })

  it('shows the clear-passkey button only when passkeyEnabled and passkeyCount > 0', () => {
    const withPasskey = makeAdminUser({ id: 'pk-1', passkeyCount: 2, role: 'author' })
    const htmlWith = renderOpsCard(withPasskey, 'self-1', true)
    expect(htmlWith).toContain('清除 Passkey')
    // React interpolates the count with HTML comment markers around the
    // number, so assert via a regex that tolerates the markers.
    expect(htmlWith).toMatch(/清除 Passkey \(<!-- -->2<!-- -->\)/u)

    // passkeyEnabled=false hides it even when passkeyCount > 0.
    const htmlDisabled = renderOpsCard(withPasskey, 'self-1', false)
    expect(htmlDisabled).not.toContain('清除 Passkey')

    // passkeyCount=0 hides it even when passkeyEnabled=true.
    const noPasskey = makeAdminUser({ id: 'pk-2', passkeyCount: 0, role: 'author' })
    const htmlZero = renderOpsCard(noPasskey, 'self-1', true)
    expect(htmlZero).not.toContain('清除 Passkey')
  })

  it('shows "解除禁言" for a muted non-admin user', () => {
    const user = makeAdminUser({ id: 'muted-1', role: 'visitor', isMuted: true })
    const html = renderOpsCard(user)
    // The mute toggle label flips to "解除禁言" (unmute) when isMuted is true.
    // The button is the only place this compound word appears as a label.
    expect(html).toContain('解除禁言')
    // Confirm the unmute variant is shown by checking the Volume2 icon class
    // (unmute) is present rather than VolumeOff (mute).
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
    // currentUserId === user.id skips the role <Select>.
    expect(html).not.toContain('角色')
  })

  it('shows the role select for another user with a non-null role', () => {
    const user = makeAdminUser({ id: 'other-1', role: 'author' })
    const html = renderOpsCard(user, 'self-1')
    // The role <Select> trigger renders with the current role value. The
    // dropdown options (管理员/作者/访客) live in a Base UI SelectContent
    // portal that does not emit during SSR, so we assert the trigger only.
    expect(html).toContain('角色')
    expect(html).toContain('data-slot="select-trigger"')
    expect(html).toContain('data-slot="select-value">author</span>')
  })
})

// ──────────────────────────── UserDetailView ───────────────────────────────
// UserDetailView calls useQuery (user + comments) and several useMutation
// hooks. We stub @tanstack/react-query so SSR resolves the fixture user and
// renders the detail body.

const queryMocks = vi.hoisted(() => ({
  userQuery: {
    data: null as { user: AdminUserDto } | null,
    isPending: false,
    isFetching: false,
    error: null as unknown,
    refetch: vi.fn(),
  },
  commentsQuery: {
    data: null as { comments: unknown[] } | null,
    isPending: false,
    isFetching: false,
    error: null as unknown,
    refetch: vi.fn(),
  },
  mutation: { mutate: vi.fn(), isPending: false },
  queryClient: { invalidateQueries: vi.fn(), setQueryData: vi.fn(), removeQueries: vi.fn() },
}))

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query')
  return {
    ...actual,
    // First useQuery call in UserDetailView is the user fetch; the second is
    // the comments fetch. We distinguish by call order and reset the counter
    // from a hoisted mutable so each `renderInRouter` starts fresh.
    useQuery: () => {
      queryCounter.n += 1
      return queryCounter.n === 1 ? queryMocks.userQuery : queryMocks.commentsQuery
    },
    useMutation: () => queryMocks.mutation,
    useQueryClient: () => queryMocks.queryClient,
  }
})

// Hoisted call-order counter; reset before each UserDetailView render.
const queryCounter = vi.hoisted(() => ({ n: 0 }))

vi.mock('@/client/api/orpc-query', () => ({
  orpcQuery: {
    admin: {
      users: {
        get: { queryOptions: (args: unknown) => ({ queryKey: ['user', args], queryFn: async () => ({}) }) },
        sendPasswordReset: { mutationOptions: () => ({ mutationKey: ['reset'] }) },
        revokeAllSessions: { mutationOptions: () => ({ mutationKey: ['revoke'] }) },
        bulkApproveComments: { mutationOptions: () => ({ mutationKey: ['approve'] }) },
        bulkDeleteComments: { mutationOptions: () => ({ mutationKey: ['bulkDel'] }) },
      },
      comments: {
        loadAll: { queryOptions: (args: unknown) => ({ queryKey: ['comments', args], queryFn: async () => ({}) }) },
      },
    },
  },
}))

describe('snapshot: UserDetailView', () => {
  beforeEach(() => {
    // Reset the call-order counter so the first useQuery in each test maps to
    // the user fetch and the second to the comments fetch.
    queryCounter.n = 0
  })

  it('renders the skeleton when the user query is pending', () => {
    queryMocks.userQuery = { data: null, isPending: true, isFetching: false, error: null, refetch: vi.fn() }
    queryMocks.commentsQuery = { data: null, isPending: true, isFetching: false, error: null, refetch: vi.fn() }
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
    queryMocks.userQuery = {
      data: { user },
      isPending: false,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
    }
    queryMocks.commentsQuery = {
      data: { comments: [] },
      isPending: false,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
    }
    const html = stableHtml(
      renderInRouter(
        <UserDetailView userId="detail-1" currentUserId="admin-1" navigate={vi.fn()} passkeyEnabled={false} />,
        '/admin/security/users/detail-1',
      ),
    )
    // Header + avatar name/email.
    expect(html).toContain('用户详情')
    expect(html).toContain('Detail Diana')
    expect(html).toContain('diana@example.com')
    // Role badge.
    expect(html).toContain('作者')
    // Viewing another user renders the role editor in the operations card.
    expect(html).toContain('data-slot="select-trigger"')
    // Status badge: not muted, not deleted => 正常.
    expect(html).toContain('正常')
    // Custom badge.
    expect(html).toContain('VIP')
    // Stats card.
    expect(html).toContain('统计信息')
    expect(html).toContain('评论总数')
    expect(html).toContain('12')
    expect(html).toContain('待审核')
    expect(html).toContain('3')
    // Empty comments branch.
    expect(html).toContain('该用户暂无评论。')
    // Back button.
    expect(html).toContain('aria-label="返回用户列表"')
  })

  it('hides the role editor when the admin views their own detail', () => {
    const user = makeAdminUser({
      id: 'self-1',
      name: 'Self Admin',
      role: 'admin',
    })
    queryMocks.userQuery = {
      data: { user },
      isPending: false,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
    }
    queryMocks.commentsQuery = {
      data: { comments: [] },
      isPending: false,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
    }
    const html = stableHtml(
      renderInRouter(
        <UserDetailView userId="self-1" currentUserId="self-1" navigate={vi.fn()} passkeyEnabled={false} />,
        '/admin/security/users/self-1',
      ),
    )
    expect(html).toContain('Self Admin')
    // No role Select when the viewed user is the viewer themself.
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
    queryMocks.userQuery = {
      data: { user },
      isPending: false,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
    }
    queryMocks.commentsQuery = {
      data: { comments: [] },
      isPending: false,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
    }
    const html = stableHtml(
      renderInRouter(
        <UserDetailView userId="dm-1" currentUserId="admin-1" navigate={vi.fn()} passkeyEnabled={false} />,
        '/admin/security/users/dm-1',
      ),
    )
    // deletedAt takes precedence over isMuted in the badge chain.
    expect(html).toContain('已删除')
    expect(html).not.toContain('已禁言')
    // The operations card shows the restore button.
    expect(html).toContain('恢复用户')
  })

  it('renders the anonymous badge and passkey count when passkeyEnabled', () => {
    const user = makeAdminUser({
      id: 'anon-det-1',
      name: 'Ghost',
      role: null,
      passkeyCount: 4,
    })
    queryMocks.userQuery = {
      data: { user },
      isPending: false,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
    }
    queryMocks.commentsQuery = {
      data: { comments: [] },
      isPending: false,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
    }
    const html = stableHtml(
      renderInRouter(
        <UserDetailView userId="anon-det-1" currentUserId="admin-1" navigate={vi.fn()} passkeyEnabled={true} />,
        '/admin/security/users/anon-det-1',
      ),
    )
    expect(html).toContain('匿名')
    // Passkey row only renders when passkeyEnabled is true.
    expect(html).toContain('Passkey')
    expect(html).toContain('4')
  })
})
