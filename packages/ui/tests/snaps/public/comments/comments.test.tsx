import type { CommentItemWire as CommentItemType } from '@kobato/shared/contracts/comments'

import { makeLeafContext } from '#/_helpers/comments-leaf'
import { lexCommentBody } from '#/_helpers/lexical-body'
import { renderInRouter } from '#/_helpers/render'

import { CommentItem } from '@kobato/ui/public/comments/comment-item/CommentItem'
import { describe, expect, it } from 'vitest'

function makeComment(overrides: Partial<CommentItemType> = {}): CommentItemType {
  return {
    id: '1',
    createAt: '2024-01-15T08:30:00.000Z',
    updatedAt: '2024-01-15T08:30:00.000Z',
    deleteAt: null,
    body: lexCommentBody('Hello, world.'),
    type: 'post' as const,
    ownerId: '1',
    userId: '42',
    isVerified: true,
    rid: 0,
    isCollapsed: false,
    isPending: false,
    isPinned: false,
    voteUp: 0,
    voteDown: 0,
    rootId: null,
    name: 'Alice',
    emailVerified: true,
    link: 'https://alice.example.com',
    badgeName: null,
    badgeColor: null,
    badgeTextColor: null,
    children: [],
    ...overrides,
  }
}

describe('snapshot: comment HTML', () => {
  it('root comment without children, non-admin viewer', () => {
    const Leaf = makeLeafContext()
    const html = renderInRouter(
      <Leaf>
        <CommentItem comment={makeComment()} depth={1} />
      </Leaf>,
    )
    expect(html).toContain('id="user-comment-1"')
    expect(html).toContain('Alice')
    expect(html).toContain('Hello, world.')
    expect(html).toContain('回复')
    expect(html).not.toContain('编辑')
    expect(html).not.toContain('删除')
  })

  it('renders author badge inline with the comment author', () => {
    const Leaf = makeLeafContext()
    const html = renderInRouter(
      <Leaf>
        <CommentItem
          comment={makeComment({
            badgeName: '站长',
            badgeColor: '#6ab7ca',
            badgeTextColor: '#151b2b',
          })}
          depth={1}
        />
      </Leaf>,
    )
    expect(html).toMatch(/<span class="[^"]*\bleading-badge\b[^"]*\btext-badge\b[^"]*\bfont-bold\b/u)
    expect(html).toContain('color:#151b2b')
    expect(html).not.toMatch(/<div[^>]*\bleading-badge\b/u)
    expect(html).not.toContain('comment-author-badge')
    expect(html).toContain('站长')
  })

  it('root comment with one nested child, admin viewer (edit/delete buttons)', () => {
    const child = makeComment({
      id: '2',
      rid: 1,
      rootId: '1',
      name: 'Bob',
      link: null,
      body: lexCommentBody('Reply.'),
    })
    const root = makeComment({ children: [child] })
    const Leaf = makeLeafContext({ identity: { admin: true } })
    const html = renderInRouter(
      <Leaf>
        <CommentItem comment={root} depth={1} />
      </Leaf>,
    )
    expect(html).toContain('id="user-comment-1"')
    expect(html).toContain('id="user-comment-2"')
    expect(html).toContain('Alice')
    expect(html).toContain('Bob')
    expect(html).toContain('编辑')
    expect(html).toContain('删除')
    expect(html).toContain('id="user-comment-2"')
  })

  it('pending comment shows the moderation hint', () => {
    const Leaf = makeLeafContext()
    const html = renderInRouter(
      <Leaf>
        <CommentItem comment={makeComment({ isPending: true })} depth={1} pending />
      </Leaf>,
    )
    expect(html).toContain('您的评论正在等待审核中...')
  })

  it('does not emit any inline onerror= attributes on rendered comment HTML', () => {
    const Leaf = makeLeafContext({ identity: { admin: true } })
    const html = renderInRouter(
      <Leaf>
        <CommentItem comment={makeComment()} depth={1} />
      </Leaf>,
    )
    expect(html.toLowerCase()).not.toContain('onerror')
  })
})
