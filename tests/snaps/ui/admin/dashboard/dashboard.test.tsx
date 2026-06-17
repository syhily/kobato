import { describe, expect, it } from 'vitest'

import { renderInRouter, renderToHtml, stableHtml } from '#/_helpers/render'
import { QuickActions } from '@/ui/admin/dashboard/QuickActions'
import { RecentDraftsCard } from '@/ui/admin/dashboard/RecentDraftsCard'
import { RecentMyCommentsCard } from '@/ui/admin/dashboard/RecentMyCommentsCard'
import { RecentPublishedCard } from '@/ui/admin/dashboard/RecentPublishedCard'
import { StatsGrid } from '@/ui/admin/dashboard/StatsGrid'
import { WeeklyTrendCard } from '@/ui/admin/dashboard/WeeklyTrendCard'

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

describe('snapshot: RecentMyCommentsCard', () => {
  it('renders a list of comments', () => {
    const html = stableHtml(
      renderInRouter(
        <RecentMyCommentsCard
          comments={[
            {
              id: '1',
              excerpt: 'Great post!',
              createdAtIso: '2024-01-15T10:00:00.000Z',
              isPending: false,
              entity: { title: 'Hello', permalink: '/posts/hello' },
            },
            {
              id: '2',
              excerpt: 'Pending comment',
              createdAtIso: '2024-01-16T11:00:00.000Z',
              isPending: true,
              entity: null,
            },
          ]}
        />,
      ),
    )
    expect(html).toContain('我的最近评论')
    expect(html).toContain('Great post!')
    expect(html).toContain('Pending comment')
    expect(html).toContain('《Hello》')
    expect(html).toContain('/posts/hello')
    expect(html).toContain('[待审]')
    expect(html).toContain('(目标已删除)')
  })

  it('renders empty state', () => {
    const html = stableHtml(renderInRouter(<RecentMyCommentsCard comments={[]} />))
    expect(html).toContain('我的最近评论')
    expect(html).toContain('你还没有发表过评论')
  })
})

describe('snapshot: WeeklyTrendCard', () => {
  it('renders trend chart with daily buckets', () => {
    const html = stableHtml(
      renderToHtml(
        <WeeklyTrendCard
          points={[
            { time: '2024-01-15T00:00:00.000Z', visits: 10, visitors: 5 },
            { time: '2024-01-15T01:00:00.000Z', visits: 20, visitors: 8 },
            { time: '2024-01-16T00:00:00.000Z', visits: 30, visitors: 12 },
          ]}
        />,
      ),
    )
    expect(html).toContain('最近 7 天访问趋势')
    expect(html).toContain('总访问')
    expect(html).toContain('60')
    expect(html).toContain('<svg')
    expect(html).toContain('path')
  })

  it('renders empty trend without points', () => {
    const html = stableHtml(renderToHtml(<WeeklyTrendCard points={[]} />))
    expect(html).toContain('最近 7 天访问趋势')
    expect(html).toContain('0')
  })
})
