import { describe, expect, it, vi } from 'vitest'

import type { CommentItemWire as CommentItemType, Comments as CommentsData } from '@/shared/types/comments'

import { inklingParagraph } from '#/_helpers/inkling'
import { renderInRouter, stableHtml } from '#/_helpers/render'
import { Comments } from '@/ui/public/comments/Comments'

// `Comments` is a pure-render orchestrator: it takes a pre-loaded
// `comments` aggregate + `items` array and hydrates a `useReducer` tree
// from them. The reducer/list-render branches are what we want to cover
// here — populated tree with nested replies, the load-more sentinel,
// the no-comments state, and the failure placeholder.

// The component still pulls `useMutation` (token revoke, my-comments
// merge, load-more) from `@tanstack/react-query`. Effects that fire
// those mutations don't run under SSR, but the hook itself is called
// during render, so we stub it to avoid real network plumbing.

const queryMocks = vi.hoisted(() => ({
  mutation: { mutate: vi.fn(), isPending: false },
  mutationWithSuccess: { mutate: vi.fn(), isPending: false },
}))

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query')
  return {
    ...actual,
    // All `useMutation` callers in `Comments` get the same inert stub.
    useMutation: () => queryMocks.mutation,
  }
})

// `useCommentsSettings` reads the page-size used by the LoadMore button.
// The BlogSettingsProvider in the render helper already supplies a bundle,
// so no extra mock is needed — but `Comments.LoadMore` also depends on
// `useCommentsActions`/`useCommentsState` which are wired internally by
// `CommentsRoot`, so the consumer of this test only has to feed props.

// ───────────────────────────── fixtures ─────────────────────────────

let seq = 0
function makeComment(overrides: Partial<CommentItemType> = {}): CommentItemType {
  seq += 1
  return {
    id: overrides.id ?? String(seq),
    createAt: overrides.createAt ?? '2024-03-12T08:30:00.000Z',
    updatedAt: overrides.updatedAt ?? '2024-03-12T08:30:00.000Z',
    deleteAt: overrides.deleteAt ?? null,
    deleteRequestedAt: overrides.deleteRequestedAt ?? null,
    body: overrides.body ?? inklingParagraph(`Body ${seq}`),
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
    // Orchestrator wrapper.
    expect(html).toContain('id="comments"')
    // Header branch renders the total count.
    expect(html).toContain('评论')
    expect(html).toContain('(5)')
    // The list map branch executed for both roots.
    expect(html).toContain('id="user-comment-1"')
    expect(html).toContain('id="user-comment-2"')
    expect(html).toContain('Alice')
    expect(html).toContain('Bob')
    expect(html).toContain('Body 1')
    expect(html).toContain('Body 2')
    // Reply-form slot branch (renders the anonymous reply form when no
    // active reply target).
    expect(html).toContain('id="respond"')
    expect(html).toContain('发表评论')
    // LoadMore branch fires because rootsLoaded (2) < rootsTotal (5).
    expect(html).toContain('加载更多')
    expect(html).toContain('data-key="/posts/hello"')
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
    // No row markup emitted.
    expect(html).not.toContain('user-comment-')
    // rootsLoaded (0) >= rootsTotal (0) → no load-more button.
    expect(html).not.toContain('加载更多')
    // Reply form still present — the empty thread still accepts a new
    // top-level comment.
    expect(html).toContain('id="respond"')
  })

  it('renders the failure placeholder when comments is null', () => {
    const html = stableHtml(
      renderInRouter(<Comments commentKey="/posts/hello" comments={null} items={[]} />, '/posts/hello'),
    )
    // Early-return failure branch.
    expect(html).toContain('评论加载失败')
    // None of the orchestrator chrome renders on the failure branch.
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
