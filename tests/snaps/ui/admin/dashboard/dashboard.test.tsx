import { describe, expect, it } from 'vitest'

import { renderInRouter, stableHtml } from '#/_helpers/render'
import { QuickActions } from '@/ui/admin/dashboard/QuickActions'
import { RecentDraftsCard } from '@/ui/admin/dashboard/RecentDraftsCard'
import { RecentPublishedCard } from '@/ui/admin/dashboard/RecentPublishedCard'
import { StatsGrid } from '@/ui/admin/dashboard/StatsGrid'

describe('snapshot: QuickActions', () => {
  it('renders action buttons with links', () => {
    const html = stableHtml(renderInRouter(<QuickActions />))
    expect(html).toContain('新建文章')
    expect(html).toContain('/editor/post/new')
    expect(html).toContain('新建页面')
    expect(html).toContain('/editor/page/new')
    expect(html).toContain('上传图片')
    expect(html).toContain('/admin/library/images')
  })
})

describe('snapshot: StatsGrid', () => {
  it('renders four stat cards', () => {
    const html = stableHtml(
      renderInRouter(
        <StatsGrid
          stats={{
            draftCount: 3,
            publishedCount: 12,
            myCommentsTotal: 8,
            myCommentsPending: 2,
          }}
        />,
      ),
    )
    expect(html).toContain('我的草稿')
    expect(html).toContain('已发布文章')
    expect(html).toContain('我的评论')
    expect(html).toContain('待审评论')
    expect(html).toContain('3')
    expect(html).toContain('12')
    expect(html).toContain('8')
    expect(html).toContain('2')
    expect(html).toContain('/admin/posts?status=draft')
    expect(html).toContain('/admin/posts?status=published')
    expect(html).toContain('/admin/me/comments')
    expect(html).toContain('/admin/me/comments?status=pending')
  })

  it('emphasizes pending count when greater than zero', () => {
    const html = stableHtml(
      renderInRouter(
        <StatsGrid
          stats={{
            draftCount: 0,
            publishedCount: 0,
            myCommentsTotal: 0,
            myCommentsPending: 5,
          }}
        />,
      ),
    )
    expect(html).toContain('text-destructive')
  })
})

describe('snapshot: RecentDraftsCard', () => {
  it('renders a list of drafts', () => {
    const html = stableHtml(
      renderInRouter(
        <RecentDraftsCard
          drafts={[
            {
              id: '1',
              title: 'Draft One',
              updatedAtIso: '2024-01-15T10:00:00.000Z',
            },
            {
              id: '2',
              title: 'Draft Two',
              updatedAtIso: '2024-01-16T11:00:00.000Z',
            },
          ]}
        />,
      ),
    )
    expect(html).toContain('最近草稿')
    expect(html).toContain('Draft One')
    expect(html).toContain('Draft Two')
    expect(html).toContain('/editor/post/1')
    expect(html).toContain('/editor/post/2')
    expect(html).toContain('2024-01-15')
    expect(html).toContain('2024-01-16')
  })

  it('renders empty state', () => {
    const html = stableHtml(renderInRouter(<RecentDraftsCard drafts={[]} />))
    expect(html).toContain('最近草稿')
    expect(html).toContain('暂无草稿')
  })
})

describe('snapshot: RecentPublishedCard', () => {
  it('renders a list of published posts', () => {
    const html = stableHtml(
      renderInRouter(
        <RecentPublishedCard
          posts={[
            {
              id: '1',
              title: 'Published One',
              updatedAtIso: '2024-01-15T10:00:00.000Z',
            },
          ]}
        />,
      ),
    )
    expect(html).toContain('最近发布')
    expect(html).toContain('Published One')
    expect(html).toContain('/editor/post/1')
  })

  it('renders empty state', () => {
    const html = stableHtml(renderInRouter(<RecentPublishedCard posts={[]} />))
    expect(html).toContain('最近发布')
    expect(html).toContain('暂无已发布文章')
  })
})
