import type { AdminPendingDashboardDto, AdminPendingItemDto } from '@kobato/contracts/comments'

import { EMPTY_STATE_LINE_IDS, pickEmptyStateLineId } from '@kobato/web-admin/ui/dashboard/empty-state-lines'
import { PendingModerationPanel } from '@kobato/web-admin/ui/dashboard/PendingModerationPanel'
import { VisitSummaryCard } from '@kobato/web-admin/ui/dashboard/VisitSummaryCard'
import { renderInRouter, stableHtml, testQueryClient } from '@kobato/web-client/tests/utils/render'
import { beforeEach, describe, expect, it } from 'vitest'

const approvalItem: AdminPendingItemDto = {
  id: 'c1',
  kind: 'approval',
  authorName: '访客·林',
  authorLink: null,
  excerpt: '这篇写得真好，收藏了。',
  createdAtIso: '2024-01-15T10:30:00.000Z',
  deleteRequestedAtIso: null,
  pageTitle: '夜航星图',
  pagePermalink: '/posts/stars',
}

const deletionItem: AdminPendingItemDto = {
  id: 'c2',
  kind: 'deletion',
  authorName: '旧读者',
  authorLink: null,
  excerpt: '请删除我之前的评论，谢谢。',
  createdAtIso: '2024-01-10T08:00:00.000Z',
  deleteRequestedAtIso: '2024-01-15T12:00:00.000Z',
  pageTitle: '旧时光',
  pagePermalink: '/posts/old-days',
}

function makeDashboard(items: AdminPendingItemDto[]): AdminPendingDashboardDto {
  const approvals = items.filter((i) => i.kind === 'approval').length
  const deletions = items.filter((i) => i.kind === 'deletion').length
  return {
    items,
    total: items.length,
    hasMore: false,
    counts: { all: items.length, approval: approvals, deletion: deletions },
  }
}

describe('snapshot: pickEmptyStateLineId', () => {
  it('returns one of the EMPTY_STATE_LINE_IDS', () => {
    const id = pickEmptyStateLineId()
    expect(EMPTY_STATE_LINE_IDS).toContain(id)
  })

  it('exposes a non-empty set of fallback line ids', () => {
    expect(EMPTY_STATE_LINE_IDS.length).toBeGreaterThan(0)
    for (const id of EMPTY_STATE_LINE_IDS) {
      expect(typeof id).toBe('string')
      expect(id.length).toBeGreaterThan(0)
    }
  })
})

describe('snapshot: PendingModerationPanel', () => {
  beforeEach(() => {
    testQueryClient.clear()
  })

  it('renders pending rows with approve/reject actions', () => {
    const initial = makeDashboard([approvalItem, deletionItem])
    const html = stableHtml(
      renderInRouter(<PendingModerationPanel initial={initial} emptyStateLineId={EMPTY_STATE_LINE_IDS[0]!} />),
    )
    expect(html).toContain('待审评论')
    expect(html).toContain('等待审核与作者删除申请合并展示')
    expect(html).toContain('刷新')
    expect(html).toContain('进入评论管理')
    expect(html).toContain('/admin/comments?status=pending')
    expect(html).toContain('访客·林')
    expect(html).toContain('等待审核')
    expect(html).toContain('这篇写得真好，收藏了。')
    expect(html).toContain('《夜航星图》')
    expect(html).toContain('通过')
    expect(html).toContain('旧读者')
    expect(html).toContain('等待删除')
    expect(html).toContain('同意删除')
    expect(html).toContain('拒绝删除')
  })

  it('renders the configured empty-state line when the queue is empty', () => {
    const line = '审核台空空如也，今日得清闲。'
    const html = stableHtml(
      renderInRouter(
        <PendingModerationPanel initial={makeDashboard([])} emptyStateLineId="admin.welcome.empty.line1" />,
      ),
    )
    expect(html).toContain('待审评论')
    expect(html).toContain(line)
    expect(html).not.toContain('通过')
    expect(html).not.toContain('同意删除')
  })
})

describe('snapshot: VisitSummaryCard', () => {
  it('renders today KPI counters and a link to the analytics page', () => {
    const html = stableHtml(
      renderInRouter(<VisitSummaryCard summary={{ visits: 1024, visitors: 512, referers: 8 }} weeklyTrend={null} />),
    )
    expect(html).toContain('今日概览')
    expect(html).toContain('最近 24 小时访问统计')
    expect(html).toContain('访问量')
    expect(html).toContain('访客数')
    expect(html).toContain('来源域名')
    expect(html).toContain('1,024')
    expect(html).toContain('512')
    expect(html).toContain('/admin/analytics?preset=today')
    expect(html).toContain('查看详情')
  })

  it('renders the 7-day trend skeleton during SSR — the UTC-bucketed loader payload never paints', () => {
    const html = stableHtml(
      renderInRouter(
        <VisitSummaryCard
          summary={{ visits: 0, visitors: 0, referers: 0 }}
          weeklyTrend={{
            unit: 'day',
            clientTimezone: 'Etc/UTC',
            points: [
              { time: '2024-01-10', visits: 10, visitors: 5 },
              { time: '2024-01-11', visits: 20, visitors: 8 },
            ],
          }}
        />,
      ),
    )
    expect(html).toContain('role="status"')
    expect(html).toContain('加载中')
    expect(html).not.toContain('最近 7 天趋势')
    expect(html).not.toContain('trendGradient')
  })

  it('renders no trend block at all when the loader reports an empty week', () => {
    const html = stableHtml(
      renderInRouter(
        <VisitSummaryCard
          summary={{ visits: 0, visitors: 0, referers: 0 }}
          weeklyTrend={{ unit: 'day', clientTimezone: 'Etc/UTC', points: [] }}
        />,
      ),
    )
    expect(html).not.toContain('role="status"')
    expect(html).not.toContain('最近 7 天趋势')
  })
})
