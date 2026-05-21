import { describe, expect, it } from 'vite-plus/test'

import type { CommentItemWire as CommentItemType } from '@/shared/contracts/comments'
import type { CommentFormUser } from '@/shared/types/catalog'

import { CommentReplyForm } from '@/ui/public/comments/CommentReplyForm'
import { Comments } from '@/ui/public/comments/Comments'

import { renderInRouter } from './_helpers/render'

// `Comments.tsx` was previously a 159-line component that hand-rolled the
// admin-vs-anonymous form three times (name / email / link). After
// extracting `<CommentFormFields>` and porting the reply form to an island,
// we lock the rendered markup so any regression in the read-only-hidden vs.
// visible-required pattern is caught by a snapshot diff.
describe('snapshot: Comments form variants', () => {
  it('renders the anonymous form (visible required name/email, optional link)', () => {
    const html = renderInRouter(
      <Comments
        commentKey="https://yufan.me/posts/hello/"
        comments={{ comments: [], count: 0, roots_count: 0 }}
        items={[]}
      />,
    )
    expect(html).toMatchSnapshot()
  })

  it('renders the admin form (hidden readonly identity inputs preloaded)', () => {
    const adminUser: CommentFormUser = {
      id: '1',
      name: 'Admin',
      email: 'admin@yufan.me',
      website: 'https://yufan.me',
      admin: true,
    }
    const html = renderInRouter(
      <Comments
        commentKey="https://yufan.me/posts/hello/"
        comments={{ comments: [], count: 0, roots_count: 0 }}
        items={[]}
        user={adminUser}
      />,
    )
    expect(html).toMatchSnapshot()
  })

  it('returns the failure placeholder when comments is null', () => {
    const html = renderInRouter(<Comments commentKey="https://yufan.me/posts/hello/" comments={null} items={[]} />)
    expect(html).toContain('评论加载失败')
  })

  it('offsets the reply textarea below the reply context overlay', () => {
    const replyTarget: CommentItemType = {
      id: '42',
      createAt: '2024-04-18T13:06:00.000Z',
      updatedAt: '2024-04-18T13:06:00.000Z',
      deleteAt: null,
      content: null,
      body: [
        {
          _type: 'block',
          _key: 'b1',
          style: 'normal',
          children: [{ _type: 'span', _key: 's1', text: '谢谢告知，目前 RSS 在 Next.js 下面使用起来比较困难。' }],
        },
      ],
      type: 'post' as const,
      ownerId: '1',
      userId: '1',
      isVerified: true,
      ua: '',
      ip: '',
      rid: 1,
      isCollapsed: false,
      isPending: false,
      isPinned: false,
      voteUp: 0,
      voteDown: 0,
      rootId: '1',
      name: '雨帆',
      email: 'admin@yufan.me',
      emailVerified: true,
      link: 'https://yufan.me',
      badgeName: '站长',
      badgeColor: '#6ab7ca',
      badgeTextColor: '#151b2b',
      children: [],
    }

    const html = renderInRouter(
      <CommentReplyForm
        commentKey="https://yufan.me/posts/hello/"
        replyToId={42}
        replyTarget={replyTarget}
        onCancel={() => undefined}
        onReplied={() => undefined}
      />,
    )

    // The reply editor container flips on extra padding-top (`pt-10`)
    // when a reply is staged so the absolutely-positioned
    // `<ReplyOverlay>` doesn't sit on top of the user's caret. The
    // editor is a `<div>` wrapper around the Tiptap content area,
    // so the assertion keys off the `pt-10` utility on that wrapper.
    expect(html).toMatch(/<div[^>]*class="[^"]*\bpt-10\b/u)
    expect(html).toMatch(/<div class="[^"]*\bpointer-events-none\b[^"]*\babsolute\b[^"]*\btop-\[0\.4rem\]/u)
    expect(html).toContain('回复 @雨帆')
  })
})
