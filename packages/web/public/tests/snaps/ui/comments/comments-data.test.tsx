import type { Comments as CommentsData } from '@kobato/contracts/comments.ts'

import { makeComment } from '@kobato/contracts/tests/utils/catalog.ts'
import { mockTanstackQuery } from '@kobato/test/mock-react-query.ts'
import { renderInRouter, stableHtml } from '@kobato/web-client/tests/utils/render.tsx'
import { Comments } from '@kobato/web-public/ui/comments/Comments.tsx'
import { describe, expect, it } from 'vitest'

mockTanstackQuery()

const commentsData = (count: number, roots: number): CommentsData => ({
  count,
  roots_count: roots,
})

describe('snapshot: Comments data-loaded tree', () => {
  it('renders a populated root list with reply form, header and load-more', () => {
    const items = [
      makeComment({ id: '1', name: 'Alice', userId: '10' }),
      makeComment({ id: '2', name: 'Bob', userId: '11' }),
    ]
    const html = stableHtml(
      renderInRouter(
        <Comments commentKey="/posts/hello" comments={commentsData(5, 5)} items={items} />,
        '/posts/hello',
      ),
    )
    expect(html).toContain('id="comments"')
    expect(html).toContain('评论')
    expect(html).toContain('(5)')
    expect(html).toContain('id="user-comment-1"')
    expect(html).toContain('id="user-comment-2"')
    expect(html).toContain('Alice')
    expect(html).toContain('Bob')
    expect(html).toContain('Body 1')
    expect(html).toContain('Body 2')
    expect(html).toContain('id="respond"')
    expect(html).toContain('发表评论')
    expect(html).toContain('加载更多')
  })

  it('renders nested replies under a root via the children map branch', () => {
    const child2 = makeComment({
      id: '3',
      rid: 1,
      rootId: '1',
      name: 'Carol',
      userId: '12',
    })
    const child3 = makeComment({
      id: '4',
      rid: 1,
      rootId: '1',
      name: 'Dave',
      userId: '13',
    })
    const root = makeComment({
      id: '1',
      name: 'Alice',
      userId: '10',
      children: [child2, child3],
    })
    const html = stableHtml(
      renderInRouter(
        <Comments commentKey="/posts/hello" comments={commentsData(3, 1)} items={[root]} />,
        '/posts/hello',
      ),
    )
    expect(html).toContain('id="user-comment-1"')
    expect(html).toContain('id="user-comment-3"')
    expect(html).toContain('id="user-comment-4"')
    expect(html).toContain('Alice')
    expect(html).toContain('Carol')
    expect(html).toContain('Dave')
    expect(html).not.toContain('加载更多')
  })

  it('renders a pending comment with the moderation hint (public mode)', () => {
    const html = stableHtml(
      renderInRouter(
        <Comments
          commentKey="/posts/hello"
          comments={commentsData(1, 1)}
          items={[makeComment({ id: '1', isPending: true, name: 'Anon' })]}
        />,
        '/posts/hello',
      ),
    )
    expect(html).toContain('您的评论正在等待审核中...')
    expect(html).toContain('Anon')
  })

  it('renders the no-comments empty list (no items, all roots loaded)', () => {
    const html = stableHtml(
      renderInRouter(<Comments commentKey="/posts/hello" comments={commentsData(0, 0)} items={[]} />, '/posts/hello'),
    )
    expect(html).toContain('id="comments"')
    expect(html).toContain('评论')
    expect(html).toContain('(0)')
    expect(html).not.toContain('user-comment-')
    expect(html).not.toContain('加载更多')
    expect(html).toContain('id="respond"')
  })

  it('renders the failure placeholder when comments is null', () => {
    const html = stableHtml(
      renderInRouter(<Comments commentKey="/posts/hello" comments={null} items={[]} />, '/posts/hello'),
    )
    expect(html).toContain('评论加载失败')
    expect(html).not.toContain('id="respond"')
    expect(html).not.toContain('加载更多')
  })

  it('hides the load-more button once every root has been loaded', () => {
    const html = stableHtml(
      renderInRouter(
        <Comments
          commentKey="/posts/hello"
          comments={commentsData(2, 2)}
          items={[makeComment({ id: '1' }), makeComment({ id: '2' })]}
        />,
        '/posts/hello',
      ),
    )
    expect(html).toContain('id="user-comment-1"')
    expect(html).toContain('id="user-comment-2"')
    expect(html).not.toContain('加载更多')
  })
})
