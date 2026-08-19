import { describe, expect, it, vi } from 'vitest'

import type { Comments as CommentsData } from '@/shared/types/comments'

import { makeComment } from '#/_helpers/catalog'
import { mockTanstackQuery } from '#/_helpers/mock-react-query'
import { renderInRouter, stableHtml } from '#/_helpers/render'
import { Comments } from '@/ui/public/comments/Comments'

const queryMocks = mockTanstackQuery()

queryMocks.mutation = { mutate: vi.fn(), isPending: false }

// Companion to comments-data.test.tsx: extra render-path branches of the
// public Comments orchestrator — nested recursion, load-more states, reply
// slot, failure early-return. Mutations are stubbed with a hoisted
// singleton so the load-more isPending flag is flippable.

const commentsData = (count: number, roots: number): CommentsData => ({
  comments: [],
  count,
  roots_count: roots,
})

describe('snapshot: Comments render branches', () => {
  it('renders a root list with multiple siblings via the CommentsList map branch', () => {
    const items = [
      makeComment({ id: '1', name: 'Alice', userId: '10' }),
      makeComment({ id: '2', name: 'Bob', userId: '11' }),
      makeComment({ id: '3', name: 'Carol', userId: '12' }),
    ]
    const html = stableHtml(
      renderInRouter(
        <Comments commentKey="/posts/hello" comments={commentsData(3, 3)} items={items} />,
        '/posts/hello',
      ),
    )
    expect(html).toContain('评论')
    expect(html).toContain('(3)')
    expect(html).toContain('id="user-comment-1"')
    expect(html).toContain('id="user-comment-2"')
    expect(html).toContain('id="user-comment-3"')
    expect(html).toContain('Alice')
    expect(html).toContain('Bob')
    expect(html).toContain('Carol')
    // All roots loaded → no load-more button.
    expect(html).not.toContain('加载更多')
    // Reply form present (no active reply target).
    expect(html).toContain('id="respond"')
  })

  it('renders a multi-level nested tree (root → child → grandchild) via recursive children map', () => {
    const grandchild = makeComment({
      id: '3',
      rid: 2,
      rootId: '1',
      name: 'Grandchild',
      userId: '13',
    })
    const child = makeComment({
      id: '2',
      rid: 1,
      rootId: '1',
      name: 'Child',
      userId: '12',
      children: [grandchild],
    })
    const root = makeComment({
      id: '1',
      name: 'Root',
      userId: '10',
      children: [child],
    })
    const html = stableHtml(
      renderInRouter(
        <Comments commentKey="/posts/nested" comments={commentsData(1, 1)} items={[root]} />,
        '/posts/nested',
      ),
    )
    expect(html).toContain('id="user-comment-1"')
    expect(html).toContain('id="user-comment-2"')
    expect(html).toContain('id="user-comment-3"')
    expect(html).toContain('Root')
    expect(html).toContain('Child')
    expect(html).toContain('Grandchild')
    // Single root shipped, rootsTotal=1 → no load-more.
    expect(html).not.toContain('加载更多')
  })

  it('renders the load-more button in its loading state via the mutation isPending flag', () => {
    queryMocks.mutation.isPending = true
    const items = [makeComment({ id: '1', name: 'Solo' })]
    // count=10, only 1 root shipped → LoadMore renders.
    const html = stableHtml(
      renderInRouter(
        <Comments commentKey="/posts/long" comments={commentsData(10, 10)} items={items} />,
        '/posts/long',
      ),
    )
    // Pending mutation → "加载中…" + disabled.
    expect(html).toContain('加载中…')
    expect(html).toContain('disabled=""')
    queryMocks.mutation.isPending = false
  })

  it('renders the load-more button while fewer roots are loaded than the total', () => {
    const items = [makeComment({ id: '1' }), makeComment({ id: '2' }), makeComment({ id: '3' })]
    // 3 roots shipped, 10 total → the load-more button renders, not disabled.
    const html = stableHtml(
      renderInRouter(
        <Comments commentKey="/posts/paged" comments={commentsData(10, 10)} items={items} />,
        '/posts/paged',
      ),
    )
    expect(html).toContain('加载更多')
    expect(html).not.toContain('disabled=""')
  })

  it('renders the header with a zero count when the thread is empty', () => {
    const html = stableHtml(
      renderInRouter(<Comments commentKey="/posts/empty" comments={commentsData(0, 0)} items={[]} />, '/posts/empty'),
    )
    expect(html).toContain('评论')
    expect(html).toContain('(0)')
    expect(html).not.toContain('user-comment-')
    expect(html).not.toContain('加载更多')
    // Reply form still accepts a top-level comment.
    expect(html).toContain('id="respond"')
  })

  it('renders the failure placeholder and skips the orchestrator chrome', () => {
    const html = stableHtml(
      renderInRouter(<Comments commentKey="/posts/broken" comments={null} items={[]} />, '/posts/broken'),
    )
    expect(html).toContain('评论加载失败')
    // Early-return bypasses the orchestrator chrome — only the failure wrapper remains.
    expect(html).not.toContain('id="respond"')
    expect(html).not.toContain('加载更多')
  })

  it('renders the pending-moderation hint for a pending root comment', () => {
    const html = stableHtml(
      renderInRouter(
        <Comments
          commentKey="/posts/pending"
          comments={commentsData(1, 1)}
          items={[makeComment({ id: '1', isPending: true, name: 'Anon' })]}
        />,
        '/posts/pending',
      ),
    )
    expect(html).toContain('您的评论正在等待审核中')
    expect(html).toContain('Anon')
  })

  it('hides the load-more button once rootsLoaded reaches rootsTotal', () => {
    const items = [makeComment({ id: '1', name: 'First' }), makeComment({ id: '2', name: 'Second' })]
    const html = stableHtml(
      renderInRouter(<Comments commentKey="/posts/done" comments={commentsData(2, 2)} items={items} />, '/posts/done'),
    )
    expect(html).toContain('id="user-comment-1"')
    expect(html).toContain('id="user-comment-2"')
    // rootsLoaded (2) >= rootsTotal (2) → load-more returns null.
    expect(html).not.toContain('加载更多')
  })

  it('renders the reply form slot when no active reply target is set', () => {
    // Default state: replyToId === 0 → the slot renders the reply form.
    const html = stableHtml(
      renderInRouter(
        <Comments commentKey="/posts/reply" comments={commentsData(1, 1)} items={[makeComment({ id: '1' })]} />,
        '/posts/reply',
      ),
    )
    expect(html).toContain('id="respond"')
    expect(html).toContain('发表评论')
  })
})
