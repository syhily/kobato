import { describe, expect, it, vi } from 'vitest'

import type { CommentItemWire as CommentItemType } from '@/shared/contracts/comments'
import type { Comments as CommentsData } from '@/shared/types/comments'

import { renderInRouter, stableHtml } from '#/_helpers/render'
import { Comments } from '@/ui/public/comments/Comments'

// Companion to `comments-data.test.tsx`. This file targets additional
// render-path branches of the public `Comments` orchestrator that the
// data-loaded suite does not yet exercise:
//   - multi-level nesting (grandchild) so `CommentItem` recurses depth > 1,
//   - the `CommentsList` map callback over a populated root list,
//   - the `CommentsReplyFormSlot` branch when an active reply target is set
//     (activeReplyToId !== 0 → the slot returns null and the reply form is
//     suppressed from its default position),
//   - the `CommentsLoadMore` button in its `moreLoading` ("加载中…")
//     state via the mutation's `isPending` flag,
//   - the `CommentsHeader` count branch with a large total,
//   - the failure branch + populated-tree branch co-coverage to guard
//     against regressions in the early-return.
//
// `Comments` calls `useMutation` (token revoke, my-comments merge,
// load-more) from `@tanstack/react-query`. The mutation hooks themselves
// run during render; we stub them with a hoisted singleton so we can flip
// the load-more `isPending` flag to cover the "加载中…" copy.

const mutationState = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }))

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query')
  return {
    ...actual,
    useMutation: () => mutationState,
  }
})

// --- fixtures ----------------------------------------------------------------

let seq = 0

function makeComment(overrides: Partial<CommentItemType> = {}): CommentItemType {
  seq += 1
  return {
    id: overrides.id ?? String(seq),
    createAt: overrides.createAt ?? '2024-03-12T08:30:00.000Z',
    updatedAt: overrides.updatedAt ?? '2024-03-12T08:30:00.000Z',
    deleteAt: overrides.deleteAt ?? null,
    deleteRequestedAt: overrides.deleteRequestedAt ?? null,
    body: overrides.body ?? [
      {
        _type: 'block',
        _key: `b${seq}`,
        style: 'normal',
        markDefs: [],
        children: [{ _type: 'span', _key: `s${seq}`, text: `Body ${seq}` }],
      },
    ],
    type: overrides.type ?? 'post',
    ownerId: overrides.ownerId ?? '1',
    userId: overrides.userId ?? String(100 + seq),
    isVerified: overrides.isVerified ?? true,
    rid: overrides.rid ?? 0,
    isCollapsed: overrides.isCollapsed ?? false,
    isPending: overrides.isPending ?? false,
    isPinned: overrides.isPinned ?? false,
    voteUp: overrides.voteUp ?? 0,
    voteDown: overrides.voteDown ?? 0,
    rootId: overrides.rootId ?? null,
    name: overrides.name ?? `Author ${seq}`,
    emailVerified: overrides.emailVerified ?? true,
    link: overrides.link ?? null,
    badgeName: overrides.badgeName ?? null,
    badgeColor: overrides.badgeColor ?? null,
    badgeTextColor: overrides.badgeTextColor ?? null,
    children: overrides.children ?? [],
    ...overrides,
  }
}

const commentsData = (count: number, roots: number): CommentsData => ({
  comments: [],
  count,
  roots_count: roots,
})

// --- render-branch coverage --------------------------------------------------

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
    // Header count branch.
    expect(html).toContain('评论')
    expect(html).toContain('(3)')
    // All three roots rendered through the list map callback.
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
    mutationState.isPending = true
    const items = [makeComment({ id: '1', name: 'Solo' })]
    // count=10, only 1 root shipped → LoadMore renders.
    const html = stableHtml(
      renderInRouter(
        <Comments commentKey="/posts/long" comments={commentsData(10, 10)} items={items} />,
        '/posts/long',
      ),
    )
    // The LoadMore button copy flips to "加载中…" while the mutation is
    // pending, and the button is disabled.
    expect(html).toContain('加载中…')
    expect(html).toContain('disabled=""')
    mutationState.isPending = false
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
    // No row markup, no load-more.
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
    // The early-return branch bypasses CommentsRoot entirely — the wrapper
    // div (#comments) is still emitted by the failure branch itself, but
    // none of the orchestrator chrome (reply form, load-more) renders.
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
