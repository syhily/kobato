import type { AdminWebmentionWire } from '@kobato/api/contracts/webmentions'

import { mockTanstackQuery } from '@kobato/test/mock-react-query'
import { WebmentionInboxView } from '@kobato/web-admin/ui/webmentions/WebmentionInboxView'
import { WebmentionsView } from '@kobato/web-admin/ui/webmentions/WebmentionsView'
import { renderInRouter, stableHtml } from '@kobato/web-client/tests/utils/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const queryMocks = mockTanstackQuery()

function makeMention(overrides: Partial<AdminWebmentionWire> = {}): AdminWebmentionWire {
  return {
    id: '1',
    sourceUrl: 'https://sender.example/mentioning-post',
    targetUrl: 'https://example.com/posts/wm-target/',
    targetType: 'post',
    status: 'pending',
    type: 'mention',
    authorName: 'Jane Doe',
    title: '提及了你的文章',
    summary: '一段摘要。',
    verificationStatus: 'verified',
    lastVerifiedAt: '2026-08-01T00:00:00.000Z',
    lastError: null,
    verifyFailStreak: 0,
    createdAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  }
}

function inboxPage(mentions: AdminWebmentionWire[]) {
  return {
    mentions,
    total: mentions.length,
    hasMore: false,
    statusCounts: { all: mentions.length, pending: 1, approved: 1, rejected: 1, hidden: 1 },
  }
}

beforeEach(() => {
  queryMocks.infinite = {
    data: { pages: [] },
    isLoading: false,
    isFetching: false,
    isFetchingNextPage: false,
    hasNextPage: false,
    error: null,
    fetchNextPage: vi.fn(),
  }
  queryMocks.mutation = { mutate: vi.fn(), isPending: false }
  queryMocks.queryClient = { invalidateQueries: vi.fn(), setQueryData: vi.fn(), removeQueries: vi.fn() }
})

describe('snapshot: WebmentionInboxView', () => {
  it('renders the empty state', () => {
    queryMocks.infinite = { ...queryMocks.infinite, data: { pages: [inboxPage([])] } }
    const html = stableHtml(renderInRouter(<WebmentionInboxView />, '/admin/webmentions'))
    expect(html).toContain('暂无收到的 Webmention')
  })

  it('renders status badges and only offers actions on pending rows', () => {
    queryMocks.infinite = {
      ...queryMocks.infinite,
      data: {
        pages: [
          inboxPage([
            makeMention({ id: '1', status: 'pending' }),
            makeMention({ id: '2', status: 'approved', type: 'like', title: '通过的提及' }),
            makeMention({
              id: '3',
              status: 'rejected',
              type: 'reply',
              title: '屏蔽的提及',
              verificationStatus: 'failed',
              lastError: 'spam',
            }),
          ]),
        ],
      },
    }
    const html = stableHtml(renderInRouter(<WebmentionInboxView />, '/admin/webmentions'))
    expect(html).toContain('待审核')
    expect(html).toContain('已批准')
    expect(html).toContain('已拒绝')
    expect(html.match(/已验证/g)).toHaveLength(2)
    expect(html.match(/验证失败/g)).toHaveLength(1)
    expect(html).not.toContain('重新验证')
    expect(html).toContain('喜欢')
    expect(html).toContain('回应')
    expect(html).toContain('Jane Doe')
    expect(html).toContain('提及了你的文章')
    expect(html).toContain('一段摘要。')
    expect(html).toContain('https://example.com/posts/wm-target/')
    expect(html.match(/批准/g)).toHaveLength(3)
    expect(html.match(/拒绝/g)).toHaveLength(3)
  })

  it('renders the verification-failed badge, its tooltip, and the reverify action', () => {
    queryMocks.infinite = {
      ...queryMocks.infinite,
      data: {
        pages: [
          inboxPage([
            makeMention({
              id: '1',
              status: 'hidden',
              verificationStatus: 'failed',
              lastError: 'source could not be fetched (HTTP 404)',
              verifyFailStreak: 9,
            }),
          ]),
        ],
      },
    }
    const html = stableHtml(renderInRouter(<WebmentionInboxView />, '/admin/webmentions'))
    expect(html).toContain('已隐藏')
    expect(html).toContain('验证失败')
    expect(html).toContain('重新验证')
    expect(html.match(/批准/g)).toHaveLength(1)
    expect(html.match(/拒绝/g)).toHaveLength(2)
  })

  it('renders the status filter tabs', () => {
    queryMocks.infinite = { ...queryMocks.infinite, data: { pages: [inboxPage([])] } }
    const html = stableHtml(renderInRouter(<WebmentionInboxView />, '/admin/webmentions'))
    for (const label of ['全部', '待审核', '已批准', '已拒绝', '已隐藏']) {
      expect(html).toContain(label)
    }
  })
})

describe('snapshot: WebmentionsView', () => {
  it('renders the page header with both direction tabs, inbox active by default', () => {
    queryMocks.infinite = { ...queryMocks.infinite, data: { pages: [inboxPage([])] } }
    const html = stableHtml(renderInRouter(<WebmentionsView tab="inbox" onTabChange={vi.fn()} />, '/admin/webmentions'))
    expect(html).toContain('Webmention 管理')
    expect(html).toContain('接收审核')
    expect(html).toContain('发送日志')
    expect(html).toContain('暂无收到的 Webmention')
  })

  it('honours tab="outbox" (the ?tab= deep link) and shows the task-center link', () => {
    queryMocks.infinite = { ...queryMocks.infinite, data: { pages: [{ rows: [], total: 0, hasMore: false }] } }
    const html = stableHtml(
      renderInRouter(<WebmentionsView tab="outbox" onTabChange={vi.fn()} />, '/admin/webmentions?tab=outbox'),
    )
    expect(html).toContain('暂无发送记录')
    expect(html).not.toContain('暂无收到的 Webmention')
    expect(html).toContain('队列状态见任务中心')
    expect(html).toContain('href="/admin/tasks"')
  })
})
