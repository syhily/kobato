import type { AdminPendingDashboardDto, AdminPendingItemDto } from '@kobato/shared/contracts/comments'

import { renderInRouter, stableHtml } from '#/_helpers/render'

import { EMPTY_STATE_LINES, pickEmptyStateLine } from '@kobato/shared/contracts/dashboard'
import { PendingModerationPanel } from '@kobato/ui/admin/welcome/PendingModerationPanel'
import { VisitSummaryCard } from '@kobato/ui/admin/welcome/VisitSummaryCard'
import { describe, expect, it, vi } from 'vitest'

// PendingModerationPanel seeds a react-query cache with `initialData`. The
// shared render-helper QueryClient is a module singleton, so a second test
// would observe the first test's cached rows. Mock `useQuery` to always
// return the `initialData` passed in the options, keeping each render
// deterministic and isolated. `useMutation` is stubbed to no-op handlers.
vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query')
  return {
    ...actual,
    useQuery: (options: { initialData?: unknown }) => ({
      data: options.initialData,
      isPending: false,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
    }),
    useMutation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  }
})

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

describe('snapshot: pickEmptyStateLine', () => {
  it('returns one of the EMPTY_STATE_LINES', () => {
    const line = pickEmptyStateLine()
    expect(EMPTY_STATE_LINES).toContain(line)
  })

  it('exposes a non-empty set of fallback lines', () => {
    expect(EMPTY_STATE_LINES.length).toBeGreaterThan(0)
    for (const line of EMPTY_STATE_LINES) {
      expect(typeof line).toBe('string')
      expect(line.length).toBeGreaterThan(0)
    }
  })
})

describe('snapshot: PendingModerationPanel', () => {
  it('renders pending rows with approve/reject actions', () => {
    const initial = makeDashboard([approvalItem, deletionItem])
    const html = stableHtml(
      renderInRouter(<PendingModerationPanel initial={initial} emptyStateLine={EMPTY_STATE_LINES[0]!} />),
    )
    expect(html).toContain('待审评论')
    expect(html).toContain('等待审核与作者删除申请合并展示')
    // Refresh + go-to-moderation actions.
    expect(html).toContain('刷新')
    expect(html).toContain('进入评论管理')
    expect(html).toContain('/admin/comments?status=pending')
    // First row — an approval item.
    expect(html).toContain('访客·林')
    expect(html).toContain('等待审核')
    expect(html).toContain('这篇写得真好，收藏了。')
    expect(html).toContain('《夜航星图》')
    expect(html).toContain('通过')
    // Second row — a deletion item.
    expect(html).toContain('旧读者')
    expect(html).toContain('等待删除')
    expect(html).toContain('同意删除')
    expect(html).toContain('拒绝删除')
  })

  it('renders the configured empty-state line when the queue is empty', () => {
    const line = '审核台空空如也，今日得清闲。'
    const html = stableHtml(
      renderInRouter(<PendingModerationPanel initial={makeDashboard([])} emptyStateLine={line} />),
    )
    expect(html).toContain('待审评论')
    expect(html).toContain(line)
    // No row chrome in the empty branch.
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

  it('renders the 7-day trend block when weeklyTrend is provided', () => {
    const html = stableHtml(
      renderInRouter(
        <VisitSummaryCard
          summary={{ visits: 0, visitors: 0, referers: 0 }}
          weeklyTrend={[
            { time: '2024-01-10T00:00:00.000Z', visits: 10, visitors: 5 },
            { time: '2024-01-11T00:00:00.000Z', visits: 20, visitors: 8 },
          ]}
        />,
      ),
    )
    expect(html).toContain('最近 7 天趋势')
    expect(html).toContain('总访问')
    expect(html).toContain('30')
    expect(html).toContain('<svg')
  })
})
