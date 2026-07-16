import { describe, expect, it, vi } from 'vitest'

import { makeAdminPost } from '#/_helpers/catalog'
import { renderToHtml, stableHtml } from '#/_helpers/render'
import { renderInRouter } from '#/_helpers/render'
import { ImageField } from '@/ui/admin/editor-shared/ImageField'
import { PublishStatusRow } from '@/ui/admin/editor-shared/PublishStatusRow'
import { PostsSkeleton } from '@/ui/admin/posts/PostsSkeleton'
import { PostsView } from '@/ui/admin/posts/PostsView'
import { StatusBadge } from '@/ui/admin/posts/StatusBadge'

// PostsView wires four useQuery calls (list + categories + tags + users) via
// orpcQuery. Each spec below stubs them so SSR can render the chrome without
// hitting the network. The controller hook reads `useLocation`, so we mount
// under a memory router at the admin posts path.

const queryMocks = vi.hoisted(() => ({
  list: {
    data: null as unknown,
    isPending: true,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
  },
  aux: {
    data: null as unknown,
    isPending: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
  },
}))

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query')
  return {
    ...actual,
    // First call in PostsView is the post list; subsequent calls are the
    // categories/tags/users option fetchers. Distinguish by returning the
    // pending list for the first and empty data for the rest.
    useQuery: (() => {
      let calls = 0
      return () => {
        calls += 1
        return calls === 1 ? queryMocks.list : queryMocks.aux
      }
    })(),
  }
})

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

describe('snapshot: PostsView', () => {
  it('renders list chrome and skeleton while the initial query is pending', () => {
    queryMocks.list = {
      ...queryMocks.list,
      isPending: true,
      data: null,
    }
    const html = stableHtml(renderInRouter(<PostsView />, '/admin/posts'))
    // Header title and the create link render in any state.
    expect(html).toContain('文章管理')
    expect(html).toContain('新建文章')
    // Skeleton occupies the body before rows arrive.
    expect(html).toContain('skeleton')
  })

  it('renders status filter labels and the new-post affordance even while loading', () => {
    queryMocks.list = {
      ...queryMocks.list,
      isPending: true,
      data: null,
    }
    const html = stableHtml(renderInRouter(<PostsView />, '/admin/posts'))
    expect(html).toContain('全部状态')
    expect(html).toContain('全部作者')
  })
})

describe('snapshot: PostsSkeleton', () => {
  it('renders placeholder rows', () => {
    const html = stableHtml(renderToHtml(<PostsSkeleton />))
    expect(html).toContain('skeleton')
  })
})

// StatusBadge already has variant coverage in post-row.test.tsx — this block
// repeats one assertion per variant so a regression in the standalone export
// surfaces independently.
describe('snapshot: StatusBadge', () => {
  it('renders the published badge', () => {
    const post = makeAdminPost({
      published: true,
      visible: true,
      deletedAt: null,
      publishedRevisionId: 'r1',
    })
    const html = stableHtml(renderToHtml(<StatusBadge post={post} />))
    expect(html).toContain('已发布')
  })

  it('renders the draft badge', () => {
    const post = makeAdminPost({ published: false, deletedAt: null })
    const html = stableHtml(renderToHtml(<StatusBadge post={post} />))
    expect(html).toContain('草稿')
  })

  it('renders the deleted badge', () => {
    const post = makeAdminPost({ deletedAt: '2024-03-01T00:00:00.000Z' })
    const html = stableHtml(renderToHtml(<StatusBadge post={post} />))
    expect(html).toContain('已删除')
  })

  it('renders the hidden badge', () => {
    const post = makeAdminPost({
      published: true,
      visible: false,
      deletedAt: null,
      publishedRevisionId: 'r1',
    })
    const html = stableHtml(renderToHtml(<StatusBadge post={post} />))
    expect(html).toContain('隐藏')
  })

  it('renders the only-draft badge', () => {
    const post = makeAdminPost({
      published: true,
      visible: true,
      deletedAt: null,
      publishedRevisionId: null,
    })
    const html = stableHtml(renderToHtml(<StatusBadge post={post} />))
    expect(html).toContain('仅草稿')
  })
})

describe('snapshot: ImageField (post meta)', () => {
  it('renders the label, URL toggle and empty-state affordance when value is empty', () => {
    const html = stableHtml(
      renderToHtml(
        <ImageField
          id="post-cover"
          label="封面图"
          value=""
          onChange={() => undefined}
          aspect="aspect-[16/9]"
          urlPlaceholder="https://… 或从图片库挑选"
          emptyHint="点击此处上传封面，或粘贴一张图片 URL。"
        />,
      ),
    )
    expect(html).toContain('封面图')
    expect(html).toContain('（可选）')
    expect(html).toContain('点击此处上传封面，或粘贴一张图片 URL。')
  })

  it('renders a preview and the clear affordance when a value is set', () => {
    const html = stableHtml(
      renderToHtml(
        <ImageField
          id="post-cover"
          label="封面图"
          value="/images/cover.png"
          onChange={() => undefined}
          aspect="aspect-[16/9]"
          urlPlaceholder="https://…"
        />,
      ),
    )
    expect(html).toContain('封面图')
    expect(html).toContain('/images/cover.png')
    expect(html).toContain('清空 封面图')
  })
})

describe('snapshot: PublishStatusRow (post meta)', () => {
  it('renders the never-saved badge and the publish-mode radios', () => {
    const html = stableHtml(
      renderToHtml(
        <PublishStatusRow
          status="never-saved"
          revisionSummary={null}
          saveStatus={{ kind: 'unsaved' }}
          publishedAt=""
          onChangePublishedAt={() => undefined}
        />,
      ),
    )
    expect(html).toContain('发布状态')
    expect(html).toContain('尚未保存')
    expect(html).toContain('立即发布')
    expect(html).toContain('定时发布')
    expect(html).toContain('未保存')
  })

  it('renders the live badge for an already-published post', () => {
    const html = stableHtml(
      renderToHtml(
        <PublishStatusRow
          status="live"
          revisionSummary={{ kind: 'published-current', revisionNo: 3 }}
          saveStatus={{ kind: 'saved', atMs: 1_700_000_000_000 }}
          publishedAt=""
          onChangePublishedAt={() => undefined}
        />,
      ),
    )
    expect(html).toContain('已发布')
    expect(html).toContain('立即发布')
  })

  it('renders a scheduled publish hint when publishedAt is set', () => {
    const html = stableHtml(
      renderToHtml(
        <PublishStatusRow
          status="scheduled"
          revisionSummary={null}
          saveStatus={{ kind: 'unsaved' }}
          publishedAt="2099-01-01T09:00"
          onChangePublishedAt={() => undefined}
        />,
      ),
    )
    expect(html).toContain('定时发布')
    // DateTimePicker renders the chosen instant as a localized string.
    expect(html).toContain('2099年1月1日')
    expect(html).toContain('点击「发布草稿」会按上述时间上线')
  })
})
