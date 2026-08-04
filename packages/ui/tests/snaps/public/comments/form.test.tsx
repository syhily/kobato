import type { CommentItemWire as CommentItemType } from '@kobato/shared/contracts/comments'
import type { CommentFormUser } from '@kobato/shared/types/catalog'

import { lexCommentBody } from '#/_helpers/lexical-body'
import { renderInRouter } from '#/_helpers/render'

import { CommentReplyForm } from '@kobato/ui/public/comments/CommentReplyForm'
import { Comments } from '@kobato/ui/public/comments/Comments'
import { describe, expect, it } from 'vitest'

describe('snapshot: Comments form variants', () => {
  it('renders the anonymous form (visible required name/email, optional link)', () => {
    const html = renderInRouter(
      <Comments
        commentKey="https://example.com/posts/hello/"
        comments={{ comments: [], count: 0, roots_count: 0 }}
        items={[]}
      />,
    )
    expect(html).toContain('id="comments"')
    expect(html).toContain('评论')
    expect(html).toContain('/images/default-avatar.png')
    expect(html).toContain('name="name"')
    expect(html).toContain('name="email"')
    expect(html).toContain('name="link"')
    expect(html).toContain('type="submit"')
  })

  it('renders the admin form (hidden readonly identity inputs preloaded)', () => {
    const adminUser: CommentFormUser = {
      id: '1',
      name: 'Admin',
      email: 'admin@example.com',
      website: 'https://example.com',
      admin: true,
    }
    const html = renderInRouter(
      <Comments
        commentKey="https://example.com/posts/hello/"
        comments={{ comments: [], count: 0, roots_count: 0 }}
        items={[]}
        user={adminUser}
      />,
    )
    expect(html).toContain('id="comments"')
    expect(html).toContain('评论')
    expect(html).toContain('/images/avatar/1.png')
    expect(html).toContain('value="Admin"')
    expect(html).toContain('value="admin@example.com"')
    expect(html).toContain('value="https://example.com"')
    expect(html).toContain('readOnly')
    expect(html).toContain('hidden')
    expect(html).toContain('type="submit"')
  })

  it('returns the failure placeholder when comments is null', () => {
    const html = renderInRouter(<Comments commentKey="https://example.com/posts/hello/" comments={null} items={[]} />)
    expect(html).toContain('评论加载失败')
  })

  it('offsets the reply textarea below the reply context overlay', () => {
    const replyTarget: CommentItemType = {
      id: '42',
      createAt: '2024-04-18T13:06:00.000Z',
      updatedAt: '2024-04-18T13:06:00.000Z',
      deleteAt: null,
      body: lexCommentBody('谢谢告知，目前 RSS 在 Next.js 下面使用起来比较困难。'),
      type: 'post' as const,
      ownerId: '1',
      userId: '1',
      isVerified: true,
      rid: 1,
      isCollapsed: false,
      isPending: false,
      isPinned: false,
      voteUp: 0,
      voteDown: 0,
      rootId: '1',
      name: '雨帆',
      emailVerified: true,
      link: 'https://example.com',
      badgeName: '站长',
      badgeColor: '#6ab7ca',
      badgeTextColor: '#151b2b',
      children: [],
    }

    const html = renderInRouter(
      <CommentReplyForm
        commentKey="https://example.com/posts/hello/"
        replyToId={42}
        replyTarget={replyTarget}
        onCancel={() => undefined}
        onReplied={() => undefined}
      />,
    )

    expect(html).toMatch(/<div[^>]*class="[^"]*\bpt-10\b/u)
    expect(html).toMatch(/<div class="[^"]*\bpointer-events-none\b[^"]*\babsolute\b[^"]*\btop-\[0\.4rem\]/u)
    expect(html).toContain('回复 @雨帆')
  })
})
