import { mockTanstackQuery } from '#/_helpers/mock-react-query'
import { renderToHtml, stableHtml, renderInRouter } from '#/_helpers/render'

import { ImageField } from '@kobato/ui/admin/editor-shared/ImageField'
import { PublishStatusRow } from '@kobato/ui/admin/editor-shared/PublishStatusRow'
import { PostsSkeleton } from '@kobato/ui/admin/posts/PostsSkeleton'
import { PostsView } from '@kobato/ui/admin/posts/PostsView'
import { describe, expect, it, vi } from 'vitest'

const queryMocks = mockTanstackQuery()

queryMocks.infinite = {
  data: undefined as unknown,
  isLoading: true,
  error: null as Error | null,
  hasNextPage: false,
  isFetchingNextPage: false,
  fetchNextPage: vi.fn(),
}

queryMocks.query = {
  data: null as unknown,
  isPending: false,
  isFetching: false,
  error: null,
  refetch: vi.fn(),
}

// PostsView wires three option-list useQuery calls (categories + tags +
// users) via orpcQuery; the list itself is a useInfiniteQuery behind
// useAdminInfiniteList. Each spec below stubs them so SSR can render the
// chrome without hitting the network. The filter surface is the shared
// pill bar (the real `useFilterPills`, uncontrolled) — the view reads
// `useLocation` for the URL seed, so we mount under a memory router at the
// admin posts path.

describe('snapshot: PostsView', () => {
  it('renders list chrome and skeleton while the initial query is pending', () => {
    const html = stableHtml(renderInRouter(<PostsView />, '/admin/posts'))
    // Header title and the create link render in any state.
    expect(html).toContain('文章管理')
    expect(html).toContain('新建文章')
    // Skeleton occupies the body before rows arrive.
    expect(html).toContain('skeleton')
  })

  it('renders the pill-bar trigger and the sort select while loading', () => {
    const html = stableHtml(renderInRouter(<PostsView />, '/admin/posts'))
    // No active filters — just the 筛选 trigger in the header slot.
    expect(html).toContain('筛选')
    // The sort select is not a filter pill — it stays in the header.
    expect(html).toContain('最新发布')
  })

  it('seeds a status pill from the URL search params', () => {
    const html = stableHtml(renderInRouter(<PostsView />, '/admin/posts?status=draft'))
    // The seeded pill shows the field label and the resolved option label.
    expect(html).toContain('状态')
    expect(html).toContain('草稿')
    // Active filters bring the 添加筛选 / 清除 affordances.
    expect(html).toContain('添加筛选')
    expect(html).toContain('清除')
  })
})

describe('snapshot: PostsSkeleton', () => {
  it('renders placeholder rows', () => {
    const html = stableHtml(renderToHtml(<PostsSkeleton />))
    expect(html).toContain('skeleton')
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

  it('renders a save-result warning in the save-status line', () => {
    const html = stableHtml(
      renderToHtml(
        <PublishStatusRow
          status="live"
          revisionSummary={null}
          saveStatus={{ kind: 'warning', message: '图片库同步失败，部分图片可能无法正常显示。' }}
          publishedAt=""
          onChangePublishedAt={() => undefined}
        />,
      ),
    )
    expect(html).toContain('图片库同步失败，部分图片可能无法正常显示。')
  })
})
