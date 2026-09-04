import { describe, expect, it } from 'vitest'

import type { CommentItemWire as CommentItemType } from '@/shared/contracts/comments'

import { makeComment } from '#/_helpers/catalog'
import { makeLeafContext } from '#/_helpers/comments-leaf'
import { renderInRouter } from '#/_helpers/render'
import { unsafeCast } from '@/shared/utils/unsafe-cast'
import { CommentItem } from '@/ui/public/comments/comment-item/CommentItem'

// Divergent defaults preserved from this file's former local factory (the
// shared catalog factory is seq-based with 2024-03-12 dates).
// R12 interregnum fixture: pre-switch rows still hold PT bodies, and the
// reader renders them through the legacy PT path until R13 — so the fixture
// stays PT and crosses the wire type with a deliberate cast.
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

describe('snapshot: comment HTML', () => {
  it('root comment without children, non-admin viewer', () => {
    const Leaf = makeLeafContext()
    const html = renderInRouter(
      <Leaf>
        <CommentItem comment={makeComment({ ...aliceComment })} depth={1} />
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
            ...aliceComment,
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
      ...aliceComment,
      id: '2',
      rid: 1,
      rootId: '1',
      name: 'Bob',
      link: null,
      body: unsafeCast<CommentItemType['body']>([
        { _type: 'block', _key: 'b2', style: 'normal', children: [{ _type: 'span', _key: 's2', text: 'Reply.' }] },
      ]),
    })
    const root = makeComment({ ...aliceComment, children: [child] })
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
        <CommentItem comment={makeComment({ ...aliceComment, isPending: true })} depth={1} pending />
      </Leaf>,
    )
    expect(html).toContain('您的评论正在等待审核中...')
  })

  it('does not emit any inline onerror= attributes on rendered comment HTML', () => {
    const Leaf = makeLeafContext({ identity: { admin: true } })
    const html = renderInRouter(
      <Leaf>
        <CommentItem comment={makeComment({ ...aliceComment })} depth={1} />
      </Leaf>,
    )
    expect(html.toLowerCase()).not.toContain('onerror')
  })
})
