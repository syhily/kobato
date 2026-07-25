import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AdminCommentWire as AdminComment } from '@/shared/contracts/comments'
import type { AdminUserDto } from '@/shared/contracts/users'

import { renderInRouter, stableHtml } from '#/_helpers/render'
import { UserDetailView } from '@/ui/admin/users/UserDetailView'

// `UserDetailView` is already covered by `user-detail.test.tsx` and
// `user-cards.test.tsx` for the skeleton, resolved user chrome and most
// `UserOperationsCard` branches. This suite adds the remaining render-path
// branches that are still reachable in SSR:
//   - the recent-comments list (commentsQuery resolves with rows),
//   - the user-query error branch,
//   - an admin-role badge branch.

// ─────────────────────── react-query mock ───────────────────────────
//
// UserDetailView calls useQuery twice in order (user, then comments) and
// several useMutation hooks. We route the first call to the user fixture and
// the second to the comments fixture.

const queryMocks = vi.hoisted(() => ({
  userQuery: {
    data: null as { user: AdminUserDto } | null,
    isPending: false,
    isLoading: false,
    isFetching: false,
    isError: false,
    error: null as unknown,
    refetch: vi.fn(),
  },
  commentsQuery: {
    data: null as { comments: AdminComment[] } | null,
    isPending: false,
    isLoading: false,
    isFetching: false,
    isError: false,
    error: null as unknown,
    refetch: vi.fn(),
  },
  mutation: { mutate: vi.fn(), isPending: false },
  queryClient: {
    invalidateQueries: vi.fn(),
    setQueryData: vi.fn(),
    removeQueries: vi.fn(),
  },
}))

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query')
  return {
    ...actual,
    useQuery: () => {
      queryCounter.n += 1
      return queryCounter.n === 1 ? queryMocks.userQuery : queryMocks.commentsQuery
    },
    useMutation: () => queryMocks.mutation,
    useQueryClient: () => queryMocks.queryClient,
  }
})

const queryCounter = vi.hoisted(() => ({ n: 0 }))

vi.mock('@/client/api/orpc-query', () => ({
  orpcQuery: {
    admin: {
      users: {
        get: {
          queryOptions: (args: unknown) => ({
            queryKey: ['user', args],
            queryFn: async () => ({}),
          }),
        },
        sendPasswordReset: {
          mutationOptions: () => ({ mutationKey: ['reset'] }),
        },
        revokeAllSessions: {
          mutationOptions: () => ({ mutationKey: ['revoke'] }),
        },
        bulkApproveComments: {
          mutationOptions: () => ({ mutationKey: ['approve'] }),
        },
        bulkDeleteComments: {
          mutationOptions: () => ({ mutationKey: ['bulkDel'] }),
        },
      },
      comments: {
        loadAll: {
          queryOptions: (args: unknown) => ({
            queryKey: ['comments', args],
            queryFn: async () => ({}),
          }),
        },
      },
    },
  },
}))

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

// ───────────────────────────── fixtures ─────────────────────────────

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

function makeAdminComment(overrides: Partial<AdminComment> = {}): AdminComment {
  return {
    id: overrides.id ?? 'c1',
    createAt: overrides.createAt ?? '2024-03-12T08:30:00.000Z',
    updatedAt: overrides.updatedAt ?? '2024-03-12T08:30:00.000Z',
    deleteAt: overrides.deleteAt ?? null,
    deleteRequestedAt: overrides.deleteRequestedAt ?? null,
    body: overrides.body ?? [
      {
        _type: 'block',
        _key: 'b1',
        style: 'normal',
        markDefs: [],
        children: [{ _type: 'span', _key: 's1', text: 'A sample comment.' }],
      },
    ],
    type: overrides.type ?? 'post',
    ownerId: overrides.ownerId ?? null,
    userId: overrides.userId ?? '10',
    isVerified: overrides.isVerified ?? true,
    rid: overrides.rid ?? 0,
    isCollapsed: overrides.isCollapsed ?? false,
    isPending: overrides.isPending ?? false,
    isPinned: overrides.isPinned ?? false,
    voteUp: overrides.voteUp ?? 0,
    voteDown: overrides.voteDown ?? 0,
    rootId: overrides.rootId ?? null,
    name: overrides.name ?? 'Commenter',
    emailVerified: overrides.emailVerified ?? true,
    link: overrides.link ?? null,
    badgeName: overrides.badgeName ?? null,
    badgeColor: overrides.badgeColor ?? null,
    badgeTextColor: overrides.badgeTextColor ?? null,
    content: overrides.content ?? 'A sample comment.',
    ua: overrides.ua ?? null,
    ip: overrides.ip ?? null,
    email: overrides.email ?? 'commenter@example.com',
    pageTitle: overrides.pageTitle ?? 'Hello World',
    pagePublicId: overrides.pagePublicId ?? 'hello-world',
    pageCover: overrides.pageCover ?? null,
    pagePermalink: overrides.pagePermalink ?? '/posts/hello-world',
  }
}

function renderDetail(userId: string): string {
  return stableHtml(
    renderInRouter(
      <UserDetailView userId={userId} currentUserId="admin-1" navigate={vi.fn()} passkeyEnabled={false} />,
      `/admin/security/users/${userId}`,
    ),
  )
}

// ─────────────────────────── shared setup ───────────────────────────

describe('snapshot: UserDetailView branches', () => {
  beforeEach(() => {
    queryCounter.n = 0
    queryMocks.userQuery = {
      data: null,
      isPending: true,
      isLoading: true,
      isFetching: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    }
    queryMocks.commentsQuery = {
      data: null,
      isPending: true,
      isLoading: true,
      isFetching: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    }
    queryMocks.mutation = { mutate: vi.fn(), isPending: false }
  })

  it('renders the recent-comments list when comments resolve', () => {
    const user = makeAdminUser({
      id: 'detail-comments',
      name: 'Diana',
      role: 'author',
      commentCount: 2,
      lastCommentAt: '2024-05-01T10:00:00.000Z',
    })
    queryMocks.userQuery = {
      data: { user },
      isPending: false,
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    }
    queryMocks.commentsQuery = {
      data: {
        comments: [
          makeAdminComment({
            id: 'c1',
            content: 'First comment.',
            pageTitle: 'Post One',
          }),
          makeAdminComment({
            id: 'c2',
            content: 'Second comment.',
            pageTitle: 'Post Two',
            isPending: true,
          }),
        ],
      },
      isPending: false,
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    }

    const html = renderDetail('detail-comments')
    expect(html).toContain('用户详情')
    expect(html).toContain('Diana')
    expect(html).toContain('最近评论')
    expect(html).toContain('显示 2 条')
    expect(html).toContain('Post One')
    expect(html).toContain('Post Two')
    expect(html).toContain('待审核')
  })

  it('renders the admin-role badge for an admin user', () => {
    const user = makeAdminUser({
      id: 'detail-admin',
      name: 'Ada',
      role: 'admin',
    })
    queryMocks.userQuery = {
      data: { user },
      isPending: false,
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    }
    queryMocks.commentsQuery = {
      data: { comments: [] },
      isPending: false,
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    }

    const html = renderDetail('detail-admin')
    expect(html).toContain('Ada')
    expect(html).toContain('管理员')
    expect(html).toContain('正常')
  })
})
