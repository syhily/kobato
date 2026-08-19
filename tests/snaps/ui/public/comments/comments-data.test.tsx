import { describe, expect, it } from 'vitest'

import type { Comments as CommentsData } from '@/shared/types/comments'

import { makeComment } from '#/_helpers/catalog'
import { mockTanstackQuery } from '#/_helpers/mock-react-query'
import { renderInRouter, stableHtml } from '#/_helpers/render'
import { Comments } from '@/ui/public/comments/Comments'

mockTanstackQuery()

// Comments is a pure-render orchestrator over a pre-loaded aggregate +
// items; covers the populated/nested tree, load-more, empty and failure branches.

// useMutation hooks run during render even though their effects don't fire
// under SSR — stubbed to avoid network plumbing.

// The render helper's BlogSettingsProvider seeds the full settings bundle;
// CommentsRoot wires the rest internally — tests only feed props.

const commentsData = (count: number, roots: number): CommentsData => ({
  comments: [],
  count,
  roots_count: roots,
})

describe('snapshot: Comments data-loaded tree', () => {
  it('renders a populated root list with reply form, header and load-more', () => {
    const items = [
      makeComment({ id: '1', name: 'Alice', userId: '10' }),
      makeComment({ id: '2', name: 'Bob', userId: '11' }),
    ]
    // count=5 but only 2 roots shipped → LoadMore fires.
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
    // Reply-form slot renders with no active reply target.
    expect(html).toContain('id="respond"')
    expect(html).toContain('发表评论')
    // rootsLoaded (2) < rootsTotal (5) → LoadMore fires.
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
    // All three roots shipped → no load-more sentinel.
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
    // Header still renders with a zero count.
    expect(html).toContain('id="comments"')
    expect(html).toContain('评论')
    expect(html).toContain('(0)')
    expect(html).not.toContain('user-comment-')
    // rootsLoaded (0) >= rootsTotal (0) → no load-more button.
    expect(html).not.toContain('加载更多')
    // Empty thread still accepts a top-level comment.
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
    // rootsLoaded === rootsTotal → load-more branch returns null.
    expect(html).not.toContain('加载更多')
  })
})
