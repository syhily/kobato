import type { AdminCommentWire as AdminComment } from '@kobato/api/contracts/admin/comments'
import type { AdminUserDto } from '@kobato/api/contracts/admin/users'

import { makeCommentBody } from '@kobato/api/tests/utils/catalog'
import { UserDetailView } from '@kobato/web-admin/ui/users/UserDetailView'
import { renderInRouter, stableHtml, testQueryClient } from '@kobato/web-public/tests/utils/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { orpcQuery } = await import('@kobato/api/browser/orpc-query')

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

function makeAdminComment(overrides: Partial<AdminComment> = {}): AdminComment {
  return {
    id: overrides.id ?? 'c1',
    createAt: overrides.createAt ?? '2024-03-12T08:30:00.000Z',
    updatedAt: overrides.updatedAt ?? '2024-03-12T08:30:00.000Z',
    deleteAt: overrides.deleteAt ?? null,
    deleteRequestedAt: overrides.deleteRequestedAt ?? null,
    body: overrides.body ?? makeCommentBody('A sample comment.'),
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

describe('snapshot: UserDetailView branches', () => {
  beforeEach(() => {
    testQueryClient.clear()
  })

  it('renders the recent-comments list when comments resolve', () => {
    const user = makeAdminUser({
      id: 'detail-comments',
      name: 'Diana',
      role: 'author',
      commentCount: 2,
      lastCommentAt: '2024-05-01T10:00:00.000Z',
    })
    testQueryClient.setQueryData(
      orpcQuery.admin.users.get.queryOptions({ input: { id: 'detail-comments' } }).queryKey,
      { user: user },
    )
    testQueryClient.setQueryData(
      orpcQuery.admin.comments.loadAll.queryOptions({ input: { offset: 0, limit: 10, userId: 'detail-comments' } })
        .queryKey,
      {
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
    )

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
    testQueryClient.setQueryData(orpcQuery.admin.users.get.queryOptions({ input: { id: 'detail-admin' } }).queryKey, {
      user: user,
    })
    testQueryClient.setQueryData(
      orpcQuery.admin.comments.loadAll.queryOptions({ input: { offset: 0, limit: 10, userId: 'detail-admin' } })
        .queryKey,
      { comments: [] },
    )

    const html = renderDetail('detail-admin')
    expect(html).toContain('Ada')
    expect(html).toContain('管理员')
    expect(html).toContain('正常')
  })
})
