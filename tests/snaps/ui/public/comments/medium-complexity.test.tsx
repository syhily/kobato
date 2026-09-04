import { describe, expect, it } from 'vitest'

import type { CommentItemWire as CommentItemType } from '@/shared/contracts/comments'
import type { CommentFormUser } from '@/shared/types/catalog'
import type { Comments as CommentsData } from '@/shared/types/comments'

import { makeComment } from '#/_helpers/catalog'
import { makeLeafContext } from '#/_helpers/comments-leaf'
import { renderInRouter } from '#/_helpers/render'
import { unsafeCast } from '@/shared/utils/unsafe-cast'
import { CommentItem } from '@/ui/public/comments/comment-item/CommentItem'
import { CommentReplyForm } from '@/ui/public/comments/CommentReplyForm'
import { Comments } from '@/ui/public/comments/Comments'

// Divergent defaults preserved from this file's former local factory (the
// shared catalog factory is seq-based with 2024-03-12 dates).
// R12 interregnum fixture: PT body via deliberate cast (see comments.test.tsx).
const aliceComment: Partial<CommentItemType> = {
  id: '1',
  createAt: '2024-01-15T08:30:00.000Z',
  updatedAt: '2024-01-15T08:30:00.000Z',
  body: unsafeCast<CommentItemType['body']>([
    {
      _type: 'block',
      _key: 'b1',
      style: 'normal',
      children: [{ _type: 'span', _key: 's1', text: 'Hello, world.' }],
    },
  ]),
  userId: '42',
  name: 'Alice',
  link: 'https://alice.example.com',
}

const adminUser: CommentFormUser = {
  id: '1',
  name: 'Admin',
  email: 'admin@example.com',
  website: 'https://example.com',
  admin: true,
}

const commentsData: CommentsData = { comments: [], count: 1, roots_count: 1 }

describe('snapshot: medium-complexity comment components', () => {
  it('CommentActions renders public affordances for a visitor', () => {
    const Leaf = makeLeafContext()
    const html = renderInRouter(
      <Leaf>
        <CommentItem comment={makeComment({ ...aliceComment })} depth={1} />
      </Leaf>,
    )
    expect(html).toContain('id="user-comment-1"')
    expect(html).toContain('回复')
    expect(html).not.toContain('编辑')
    expect(html).not.toContain('删除')
    expect(html).not.toContain('通过')
  })

  it('CommentActions renders admin approve/delete buttons for pending comments', () => {
    const Leaf = makeLeafContext({ identity: { admin: true } })
    const html = renderInRouter(
      <Leaf>
        <CommentItem comment={makeComment({ ...aliceComment, isPending: true })} depth={1} />
      </Leaf>,
    )
    expect(html).toContain('通过')
    expect(html).toContain('删除')
    expect(html).toContain('您的评论正在等待审核中...')
  })

  it('CommentActions renders own-edit affordances when owned by current user', () => {
    const html = renderInRouter(
      <Comments
        commentKey="/posts/hello"
        comments={commentsData}
        items={[makeComment({ ...aliceComment, userId: '99' })]}
        user={{ ...adminUser, id: '99', admin: false }}
      />,
    )
    expect(html).toContain('修改')
    expect(html).toContain('申请删除')
  })

  it('CommentReplyForm renders anonymous inputs when no user', () => {
    const html = renderInRouter(
      <CommentReplyForm
        commentKey="/posts/hello"
        replyToId={0}
        onCancel={() => undefined}
        onReplied={() => undefined}
      />,
    )
    expect(html).toContain('id="respond"')
    expect(html).toContain('name="name"')
    expect(html).toContain('name="email"')
    expect(html).toContain('name="link"')
    expect(html).toContain('发表评论')
  })

  it('CommentReplyForm renders replying-to overlay for a nested reply', () => {
    const replyTarget = makeComment({ ...aliceComment, id: '42', name: 'Bob' })
    const html = renderInRouter(
      <CommentReplyForm
        commentKey="/posts/hello"
        replyToId={42}
        replyTarget={replyTarget}
        onCancel={() => undefined}
        onReplied={() => undefined}
      />,
    )
    expect(html).toContain('回复 @Bob')
    expect(html).toContain('再想想')
  })

  it('Comments renders header, reply form, list and load-more for one root', () => {
    const html = renderInRouter(
      <Comments
        commentKey="/posts/hello"
        comments={{ ...commentsData, roots_count: 2 }}
        items={[makeComment({ ...aliceComment })]}
      />,
    )
    expect(html).toContain('id="comments"')
    expect(html).toContain('评论')
    expect(html).toContain('Alice')
    expect(html).toContain('Hello, world.')
    expect(html).toContain('加载更多')
  })

  it('Comments renders the failure placeholder when comments is null', () => {
    const html = renderInRouter(<Comments commentKey="/posts/hello" comments={null} items={[]} />)
    expect(html).toContain('评论加载失败')
  })

  it('Comments renders nested children under a root comment', () => {
    const child = makeComment({ ...aliceComment, id: '2', name: 'Bob', rid: 1, rootId: '1' })
    const root = makeComment({ ...aliceComment, children: [child] })
    const html = renderInRouter(
      <Comments commentKey="/posts/hello" comments={{ ...commentsData, count: 2, roots_count: 1 }} items={[root]} />,
    )
    expect(html).toContain('id="user-comment-1"')
    expect(html).toContain('id="user-comment-2"')
    expect(html).toContain('Alice')
    expect(html).toContain('Bob')
  })
})
