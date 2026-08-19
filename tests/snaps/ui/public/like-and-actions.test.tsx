import { describe, expect, it, vi } from 'vitest'

import type { CommentItemWire as CommentItemType } from '@/shared/contracts/comments'

import { makeComment } from '#/_helpers/catalog'
import { makeLeafContext } from '#/_helpers/comments-leaf'
import { mockTanstackQuery } from '#/_helpers/mock-react-query'
import { renderInRouter, renderToHtml, stableHtml } from '#/_helpers/render'
import { CommentActions } from '@/ui/public/comments/comment-item/CommentActions'
import { CommentReplyForm } from '@/ui/public/comments/CommentReplyForm'
import { LikeButton, LikeShare } from '@/ui/public/LikeActions'

const queryMocks = mockTanstackQuery()

queryMocks.mutation = { isPending: false, mutate: vi.fn(), mutateAsync: vi.fn() }

// useMutation is stubbed to an inert pending-toggleable singleton (musics-view pattern) so the pending branch is reachable per-test.

// useCommentGuest reads localStorage — stub a no-guest default for SSR.
vi.mock('@/client/hooks/use-comment-guest', () => ({
  useCommentGuest: () => ({
    profile: null,
    saveProfile: vi.fn(),
    clearProfile: vi.fn(),
  }),
}))

// Replace the lazy TipTap editor with a deterministic textarea so SSR output is stable.
vi.mock('@/ui/public/comments/LazyCommentBodyEditor', () => ({
  LazyCommentBodyEditor: ({ bodyKey }: { bodyKey: string }) => (
    <textarea data-test="comment-body-editor" data-body-key={bodyKey} />
  ),
}))

// Divergent defaults preserved from this file's former local factory (the
// shared catalog factory is seq-based with 2024-03-12 dates).
const aliceComment: Partial<CommentItemType> = {
  id: '1',
  createAt: '2024-01-15T08:30:00.000Z',
  updatedAt: '2024-01-15T08:30:00.000Z',
  body: [
    {
      _type: 'block',
      _key: 'b1',
      style: 'normal',
      children: [{ _type: 'span', _key: 's1', text: 'Hello, world.' }],
    },
  ],
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
    // NumberFlow is lazy-loaded → SSR renders the Suspense fallback plain count.
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
      // Copy stays the same; only the disabled flag toggles.
      expect(html).toContain('点赞')
    } finally {
      queryMocks.mutation.isPending = false
    }
  })
})

// LikeShare is covered in like-actions.test.tsx; here only the page (root-joined) share URL shape.

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
    // The QQ / Weibo share URLs embed the absolute URL (joined with the
    // test-bundle website `https://example.com`).
    expect(html).toContain('url=https%3A%2F%2Fexample.com%2Fabout')
    // Weibo title wraps the post title, URL-encoded in the href.
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
    // Foreign comment + non-admin viewer => edit / own-edit / delete hidden.
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
    // Reply + admin edit (admin viewer → admin branch of the edit gate).
    expect(html).toContain('回复')
    expect(html).toContain('编辑')
    expect(html).toContain('通过')
    // AlertDialog content is portalled — SSR asserts only the trigger copy.
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
    // Owned by viewer → own-edit + request-delete; admin branches hidden.
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
    // Pending delete → own-edit hidden, request-delete replaced by cancel.
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
    // Anonymous-mode identity inputs are visible (not hidden).
    expect(html).toContain('id="comment-name"')
    expect(html).toContain('id="comment-email"')
    expect(html).toContain('id="comment-url"')
    expect(html).not.toContain('再想想')
    // Non-admin viewers see the honeypot.
    expect(html).toContain('发表评论')
    expect(html).toContain('name="subtitle"')
  })

  it('renders the reply-target overlay and the cancel button when replyToId is set', () => {
    const replyTarget = makeComment({
      ...aliceComment,
      id: '42',
      name: '雨帆',
      body: [
        {
          _type: 'block',
          _key: 'b1',
          style: 'normal',
          children: [{ _type: 'span', _key: 's1', text: '回复内容片段。' }],
        },
      ],
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
    // Reply overlay quotes the target author + a clipped snippet.
    expect(html).toContain('回复 @雨帆')
    expect(html).toContain('回复内容片段。')
    expect(html).toContain('再想想')
    // The hidden rid input carries the target id.
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
      // Pending mutation → submit copy flips + the textarea is disabled.
      expect(html).toContain('发表中…')
      expect(html).toContain('disabled=""')
    } finally {
      queryMocks.mutation.isPending = false
    }
  })
})
