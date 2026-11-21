import type { CommentItemWire as CommentItemType } from '@kobato/contracts/comments.ts'

import { makeComment, makeCommentBody } from '@kobato/contracts/tests/utils/catalog.ts'
import { mockTanstackQuery } from '@kobato/test/mock-react-query.ts'
import { renderInRouter, renderToHtml, stableHtml } from '@kobato/web-client/tests/utils/render.tsx'
import { makeLeafContext } from '@kobato/web-public/tests/utils/comments-leaf.tsx'
import { CommentActions } from '@kobato/web-public/ui/comments/comment-item/CommentActions.tsx'
import { CommentReplyForm } from '@kobato/web-public/ui/comments/CommentReplyForm.tsx'
import { LikeButton, LikeShare } from '@kobato/web-public/ui/LikeActions.tsx'
import { describe, expect, it, vi } from 'vitest'

const queryMocks = mockTanstackQuery()

queryMocks.mutation = { isPending: false, mutate: vi.fn(), mutateAsync: vi.fn() }

vi.mock('@kobato/web-public/ui/comments/use-comment-guest.ts', () => ({
  useCommentGuest: () => ({
    profile: null,
    saveProfile: vi.fn(),
    clearProfile: vi.fn(),
  }),
}))

vi.mock('@kobato/web-public/ui/comments/LazyCommentBodyEditor.tsx', () => ({
  LazyCommentBodyEditor: ({ bodyKey }: { bodyKey: string }) => (
    <textarea data-test="comment-body-editor" data-body-key={bodyKey} />
  ),
}))

const aliceComment: Partial<CommentItemType> = {
  id: '1',
  createAt: '2024-01-15T08:30:00.000Z',
  updatedAt: '2024-01-15T08:30:00.000Z',
  body: makeCommentBody('Hello, world.'),
  content: '<p>Hello, world.</p>',
  userId: '42',
  name: 'Alice',
  link: 'https://alice.example.com',
}

describe('snapshot: LikeButton', () => {
  it('renders the not-liked state with the like count', () => {
    const html = stableHtml(renderToHtml(<LikeButton permalink="/posts/hello" commentKey="post-1" likes={42} />))
    expect(html).toContain('点赞')
    expect(html).toContain('aria-label="点赞"')
    expect(html).toContain('aria-pressed="false"')
    expect(html).toContain('data-liked="false"')
    expect(html).toContain('<span>42</span>')
  })

  it('renders the zero-count state without crashing', () => {
    const html = stableHtml(renderToHtml(<LikeButton permalink="/posts/hello" commentKey="post-1" likes={0} />))
    expect(html).toContain('<span>0</span>')
    expect(html).toContain('点赞')
    expect(html).not.toContain('disabled=""')
  })

  it('disables the button while a like/unlike request is pending', () => {
    queryMocks.mutation.isPending = true
    try {
      const html = stableHtml(renderToHtml(<LikeButton permalink="/posts/hello" commentKey="post-1" likes={42} />))
      expect(html).toContain('disabled=""')
      expect(html).toContain('点赞')
    } finally {
      queryMocks.mutation.isPending = false
    }
  })
})

describe('snapshot: LikeShare (page permalink)', () => {
  it('renders share buttons with the absolute page URL', () => {
    const html = stableHtml(
      renderToHtml(
        <LikeShare
          post={{
            title: '关于',
            summary: 'About this blog.',
            cover: 'https://example.com/about.png',
            permalink: '/about',
          }}
        />,
      ),
    )
    expect(html).toContain('url=https%3A%2F%2Fexample.com%2Fabout')
    expect(html).toContain('title=%E3%80%90%E5%85%B3%E4%BA%8E%E3%80%91')
  })
})

describe('snapshot: CommentActions', () => {
  it('renders only the reply affordance in public mode for a foreign comment', () => {
    const Leaf = makeLeafContext()
    const html = stableHtml(
      renderInRouter(
        <Leaf>
          <CommentActions comment={makeComment({ ...aliceComment })} onEditAdmin={() => {}} onEditOwn={() => {}} />
        </Leaf>,
        '/posts/1',
      ),
    )
    expect(html).toContain('回复')
    expect(html).not.toContain('编辑')
    expect(html).not.toContain('修改')
    expect(html).not.toContain('申请删除')
    expect(html).not.toContain('通过')
    expect(html).not.toContain('删除')
  })

  it('renders the admin edit / approve / delete affordances for a pending comment', () => {
    const Leaf = makeLeafContext({ identity: { admin: true } })
    const html = stableHtml(
      renderInRouter(
        <Leaf>
          <CommentActions
            comment={makeComment({ ...aliceComment, id: '7', isPending: true })}
            onEditAdmin={() => {}}
            onEditOwn={() => {}}
          />
        </Leaf>,
        '/admin',
      ),
    )
    expect(html).toContain('回复')
    expect(html).toContain('编辑')
    expect(html).toContain('通过')
    expect(html).toContain('删除')
  })

  it('hides the approve button for an already-approved comment', () => {
    const Leaf = makeLeafContext({ identity: { admin: true } })
    const html = stableHtml(
      renderInRouter(
        <Leaf>
          <CommentActions
            comment={makeComment({ ...aliceComment, isPending: false })}
            onEditAdmin={() => {}}
            onEditOwn={() => {}}
          />
        </Leaf>,
        '/admin',
      ),
    )
    expect(html).toContain('编辑')
    expect(html).toContain('删除')
    expect(html).not.toContain('通过')
  })

  it('renders the visitor own-edit + request-delete affordances for an owned comment', () => {
    const Leaf = makeLeafContext({ identity: { currentUserId: '42', admin: false } })
    const html = stableHtml(
      renderInRouter(
        <Leaf>
          <CommentActions
            comment={makeComment({ ...aliceComment, id: '42', userId: '42' })}
            onEditAdmin={() => {}}
            onEditOwn={() => {}}
          />
        </Leaf>,
        '/posts/1',
      ),
    )
    expect(html).toContain('回复')
    expect(html).toContain('修改')
    expect(html).toContain('申请删除')
    expect(html).not.toContain('通过')
    expect(html).not.toContain('删除评论？')
  })

  it('renders the cancel-delete affordance when the visitor already requested deletion', () => {
    const Leaf = makeLeafContext({ identity: { currentUserId: '42', admin: false } })
    const html = stableHtml(
      renderInRouter(
        <Leaf>
          <CommentActions
            comment={makeComment({
              ...aliceComment,
              id: '42',
              userId: '42',
              deleteRequestedAt: '2024-06-01T00:00:00.000Z',
            })}
            onEditAdmin={() => {}}
            onEditOwn={() => {}}
          />
        </Leaf>,
        '/posts/1',
      ),
    )
    expect(html).toContain('撤回删除')
    expect(html).not.toContain('修改')
    expect(html).not.toContain('申请删除')
  })
})

describe('snapshot: CommentReplyForm', () => {
  it('renders the top-level (no reply target) form with name / email / link fields', () => {
    const html = stableHtml(
      renderInRouter(
        <CommentReplyForm commentKey="post-1" replyToId={0} onCancel={() => {}} onReplied={() => {}} />,
        '/posts/1',
      ),
    )
    expect(html).toContain('/images/default-avatar.png')
    expect(html).toContain('data-test="comment-body-editor"')
    expect(html).toContain('id="comment-name"')
    expect(html).toContain('id="comment-email"')
    expect(html).toContain('id="comment-url"')
    expect(html).not.toContain('再想想')
    expect(html).toContain('发表评论')
    expect(html).toContain('name="subtitle"')
  })

  it('renders the reply-target overlay and the cancel button when replyToId is set', () => {
    const replyTarget = makeComment({
      ...aliceComment,
      id: '42',
      name: '雨帆',
      body: makeCommentBody('回复内容片段。'),
    })
    const html = stableHtml(
      renderInRouter(
        <CommentReplyForm
          commentKey="post-1"
          replyToId={42}
          replyTarget={replyTarget}
          onCancel={() => {}}
          onReplied={() => {}}
        />,
        '/posts/1',
      ),
    )
    expect(html).toContain('回复 @雨帆')
    expect(html).toContain('回复内容片段。')
    expect(html).toContain('再想想')
    expect(html).toContain('value="42"')
  })

  it('renders the submitting (pending) state', () => {
    queryMocks.mutation.isPending = true
    try {
      const html = stableHtml(
        renderInRouter(
          <CommentReplyForm commentKey="post-1" replyToId={0} onCancel={() => {}} onReplied={() => {}} />,
          '/posts/1',
        ),
      )
      expect(html).toContain('发表中…')
      expect(html).toContain('disabled=""')
    } finally {
      queryMocks.mutation.isPending = false
    }
  })
})
