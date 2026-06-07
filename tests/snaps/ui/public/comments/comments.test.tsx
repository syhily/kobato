import { describe, expect, it } from 'vitest'

import type { CommentItemWire as CommentItemType } from '@/shared/types/comments'

import { renderInRouter } from '#/_helpers/render'
import { Comment } from '@/ui/public/comments/Comment'
import { CommentItem } from '@/ui/public/comments/comment-item/CommentItem'

function makeComment(overrides: Partial<CommentItemType> = {}): CommentItemType {
  return {
    id: '1',
    createAt: '2024-01-15T08:30:00.000Z',
    updatedAt: '2024-01-15T08:30:00.000Z',
    deleteAt: null,
    body: [
      {
        _type: 'block',
        _key: 'b1',
        style: 'normal',
        children: [{ _type: 'span', _key: 's1', text: 'Hello, world.' }],
      },
    ],
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
    const html = renderInRouter(<CommentItem comment={makeComment()} depth={1} mode="public" />)
    expect(html).toContain('id="user-comment-1"')
    expect(html).toContain('Alice')
    expect(html).toContain('Hello, world.')
    expect(html).toContain('data-rid="1"')
    expect(html).toContain('回复')
    expect(html).not.toContain('编辑')
    expect(html).not.toContain('删除')
  })

  it('renders author badge inline with the comment author', () => {
    const html = renderInRouter(
      <CommentItem
        comment={makeComment({
          badgeName: '站长',
          badgeColor: '#6ab7ca',
          badgeTextColor: '#151b2b',
        })}
        depth={1}
        mode="public"
      />,
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
      body: [
        { _type: 'block', _key: 'b2', style: 'normal', children: [{ _type: 'span', _key: 's2', text: 'Reply.' }] },
      ],
    })
    const root = makeComment({ children: [child] })
    const html = renderInRouter(<CommentItem comment={root} depth={1} mode="admin" />)
    expect(html).toContain('id="user-comment-1"')
    expect(html).toContain('id="user-comment-2"')
    expect(html).toContain('Alice')
    expect(html).toContain('Bob')
    expect(html).toContain('编辑')
    expect(html).toContain('删除')
    expect(html).toContain('id="user-comment-2"')
  })

  it('pending comment shows the moderation hint', () => {
    const html = renderInRouter(
      <CommentItem comment={makeComment({ isPending: true })} depth={1} mode="public" pending />,
    )
    expect(html).toContain('您的评论正在等待审核中...')
  })

  it('rendered list of two siblings', () => {
    const html = renderInRouter(
      <Comment comments={[makeComment({ id: '1' }), makeComment({ id: '2', name: 'Bob' })]} mode="public" />,
    )
    expect(html).toContain('id="user-comment-1"')
    expect(html).toContain('id="user-comment-2"')
    expect(html).toContain('Alice')
    expect(html).toContain('Bob')
  })

  it('does not emit any inline onerror= attributes on rendered comment HTML', () => {
    const html = renderInRouter(<CommentItem comment={makeComment()} depth={1} mode="admin" />)
    expect(html.toLowerCase()).not.toContain('onerror')
  })
})
